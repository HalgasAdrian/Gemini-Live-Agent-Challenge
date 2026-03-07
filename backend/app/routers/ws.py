"""
WebSocket endpoint with interruption context tracking.
"""

import asyncio
import base64
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agents.presets import get_agent_preset
from app.services.gemini_live import (
    get_gemini_client,
    build_live_config,
    LiveSession,
)
from app.services.session_manager import session_manager
from app.services import firestore

logger = logging.getLogger(__name__)
router = APIRouter()


class InterruptionTracker:
    """
    Tracks the agent's ongoing speech so we can inject context
    when the user interrupts mid-sentence.
    """

    def __init__(self):
        self.current_turn_text = ""      # What the agent has said so far this turn
        self.last_complete_turn = ""     # Last fully completed agent turn
        self.was_interrupted = False
        self.interruption_count = 0

    def append_text(self, text: str):
        """Called as transcript chunks stream in."""
        self.current_turn_text += text

    def mark_turn_complete(self):
        """Called when agent finishes a turn normally."""
        self.last_complete_turn = self.current_turn_text
        self.current_turn_text = ""
        self.was_interrupted = False

    def mark_interrupted(self) -> str:
        """
        Called when user interrupts. Returns what the agent was saying
        so we can inject it as context.
        """
        interrupted_text = self.current_turn_text.strip()
        self.was_interrupted = True
        self.interruption_count += 1
        self.current_turn_text = ""
        return interrupted_text

    def build_context_hint(self, interrupted_text: str) -> str | None:
        """
        Build a context hint to inject into the conversation
        so Gemini knows what was happening when interrupted.
        Only inject if there's meaningful content that was cut off.
        """
        if not interrupted_text or len(interrupted_text) < 15:
            # Too short — probably just started speaking, no context needed
            return None

        return (
            f"[Context: You were interrupted while saying: \"{interrupted_text}\" "
            f"— Respond to what the user says next. If it relates to what you were "
            f"saying, naturally weave in any key remaining info. If they changed "
            f"topic, follow them without referencing what you were saying.]"
        )


@router.websocket("/ws/session/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str):
    await ws.accept()
    logger.info(f"WebSocket connected: {session_id}")

    user_session = session_manager.register(session_id)
    preset_id = "general"
    tracker = InterruptionTracker()

    try:
        # ---- Step 1: Wait for optional config ----
        try:
            initial_msg = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
            msg = json.loads(initial_msg)
            if msg.get("type") == "config":
                preset_id = msg.get("preset", "general")
                logger.info(f"Session {session_id} configured with preset: {preset_id}")
        except (asyncio.TimeoutError, Exception):
            pass

        # ---- Step 2: Create Gemini Live session ----
        preset = get_agent_preset(preset_id)
        user_session.agent_preset_id = preset_id

        from app.config import get_settings
        settings = get_settings()

        client = get_gemini_client()
        config = build_live_config(preset)

        logger.info(f"Creating Gemini Live session with preset '{preset.name}'")

        async with client.aio.live.connect(
            model=settings.gemini_model,
            config=config,
        ) as gemini_session:
            live_session = LiveSession(session=gemini_session, preset=preset)
            user_session.live_session = live_session

            await firestore.log_session_start(session_id, preset_id)

            await ws.send_json({
                "type": "session_ready",
                "session_id": session_id,
                "agent": preset_id,
            })

            logger.info(f"Session {session_id} is live!")

            # ---- Step 3: Run bidirectional streaming ----
            client_task = asyncio.create_task(
                _forward_client_to_gemini(ws, live_session, user_session, tracker),
                name=f"client-{session_id[:8]}",
            )
            gemini_task = asyncio.create_task(
                _forward_gemini_to_client(ws, live_session, user_session, tracker),
                name=f"gemini-{session_id[:8]}",
            )

            done, pending = await asyncio.wait(
                [client_task, gemini_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in done:
                logger.info(f"Task '{task.get_name()}' completed first in session {session_id}")

            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

            for task in done:
                try:
                    task.result()
                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass
                except Exception as e:
                    logger.error(f"Task '{task.get_name()}' error: {e}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Session {session_id} error: {e}", exc_info=True)
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        turn_count = len(user_session.turns)
        logger.info(
            f"Session {session_id} stats: {turn_count} turns, "
            f"{tracker.interruption_count} interruptions"
        )
        await firestore.log_session_end(session_id, turn_count)
        await session_manager.remove(session_id)
        logger.info(f"Session {session_id} fully cleaned up.")


async def _forward_client_to_gemini(
    ws: WebSocket,
    live_session: LiveSession,
    user_session,
    tracker: InterruptionTracker,
) -> None:
    """Client audio/images/text → Gemini."""
    try:
        while live_session.is_active:
            try:
                message = await ws.receive()
            except WebSocketDisconnect:
                logger.info("Client WS disconnected in receive loop")
                raise
            except RuntimeError:
                logger.info("Client WS already disconnected")
                break

            user_session.touch()

            # Binary = raw PCM audio
            if "bytes" in message and message["bytes"]:
                await live_session.send_audio(message["bytes"])

            # Text = JSON command
            elif "text" in message and message["text"]:
                try:
                    msg = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")

                if msg_type == "image":
                    image_b64 = msg.get("data", "")
                    if image_b64:
                        image_bytes = base64.b64decode(image_b64)
                        logger.info(
                            f"📷 Camera frame: {len(image_bytes)} bytes "
                            f"(session {user_session.session_id[:8]})"
                        )
                        await live_session.send_image(image_bytes)
                        user_session.log_turn("user", "image")
                        await firestore.log_turn(
                            user_session.session_id, "user", "image"
                        )

                elif msg_type == "text":
                    text = msg.get("text", "")
                    if text:
                        # If previous turn was interrupted, inject context
                        if tracker.was_interrupted:
                            interrupted_text = tracker.current_turn_text or ""
                            context = tracker.build_context_hint(interrupted_text)
                            if context:
                                logger.info(
                                    f"💡 Injecting interruption context "
                                    f"({len(interrupted_text)} chars cut off)"
                                )
                                # Send context as a hidden system-like message
                                await live_session.send_text(context)
                                await asyncio.sleep(0.05)  # Brief pause

                            tracker.was_interrupted = False

                        logger.info(f"User text: {text[:80]}")
                        await live_session.send_text(text)
                        user_session.log_turn("user", "text", text)
                        await firestore.log_turn(
                            user_session.session_id, "user", "text", text
                        )

    except WebSocketDisconnect:
        raise
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Client→Gemini error: {e}")
        raise


async def _forward_gemini_to_client(
    ws: WebSocket,
    live_session: LiveSession,
    user_session,
    tracker: InterruptionTracker,
) -> None:
    """Gemini responses → Client with interruption tracking."""
    try:
        while live_session.is_active:
            event_count = 0
            async for event in live_session.receive():
                event_count += 1
                user_session.touch()
                event_type = event["type"]

                try:
                    if event_type == "audio":
                        await ws.send_bytes(event["data"])

                    elif event_type == "text":
                        # Track what the agent is saying for interruption context
                        tracker.append_text(event["text"])

                        await ws.send_json({
                            "type": "transcript",
                            "text": event["text"],
                        })
                        user_session.log_turn("assistant", "text", event["text"])
                        await firestore.log_turn(
                            user_session.session_id, "assistant", "text", event["text"]
                        )

                    elif event_type == "input_transcript":
                        await ws.send_json({
                            "type": "input_transcript",
                            "text": event["text"],
                        })
                        user_session.log_turn("user", "text", event["text"])

                    elif event_type == "interrupted":
                        # Capture what was being said when interrupted
                        interrupted_text = tracker.mark_interrupted()
                        context_hint = tracker.build_context_hint(interrupted_text)

                        logger.info(
                            f"🛑 Interrupted after: \"{interrupted_text[:80]}...\" "
                            f"(interruption #{tracker.interruption_count})"
                        )

                        # If we have meaningful context, inject it silently
                        if context_hint:
                            try:
                                await live_session.send_text(context_hint)
                                logger.info("💡 Interruption context injected")
                            except Exception as e:
                                logger.warning(f"Failed to inject context: {e}")

                        # Tell frontend to fade out audio
                        await ws.send_json({
                            "type": "interrupted",
                            "partial_text": interrupted_text[:200] if interrupted_text else "",
                        })
                        logger.debug(f"Session {user_session.session_id}: interrupted")

                    elif event_type == "turn_complete":
                        tracker.mark_turn_complete()
                        await ws.send_json({"type": "turn_complete"})
                        logger.info(
                            f"Session {user_session.session_id}: "
                            f"turn #{live_session.turn_count} complete"
                        )

                    elif event_type == "tool_call":
                        logger.info(f"Tool call: {event['tool_call']}")

                except (WebSocketDisconnect, RuntimeError):
                    live_session.is_active = False
                    break

            logger.warning(
                f"Session {user_session.session_id}: Gemini receive stream ended "
                f"after {event_count} events. Restarting receive loop..."
            )
            await asyncio.sleep(0.1)

    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Gemini→Client error: {e}")
        raise