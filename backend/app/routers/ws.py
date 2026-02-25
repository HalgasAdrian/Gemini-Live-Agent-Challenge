"""
WebSocket endpoint — the heart of the real-time agent.
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


@router.websocket("/ws/session/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str):
    await ws.accept()
    logger.info(f"WebSocket connected: {session_id}")

    user_session = session_manager.register(session_id)
    preset_id = "general"

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
            # Use tasks so we can cancel cleanly when one side drops
            client_task = asyncio.create_task(
                _forward_client_to_gemini(ws, live_session, user_session)
            )
            gemini_task = asyncio.create_task(
                _forward_gemini_to_client(ws, live_session, user_session)
            )

            # Wait for EITHER task to finish (one side disconnected)
            done, pending = await asyncio.wait(
                [client_task, gemini_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            # Cancel the other task gracefully
            for task in pending:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

            # Check if a task raised a real error (not just disconnect)
            for task in done:
                try:
                    task.result()
                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass  # Normal shutdown
                except Exception as e:
                    logger.error(f"Task error in session {session_id}: {e}")

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
        await firestore.log_session_end(session_id, turn_count)
        await session_manager.remove(session_id)
        logger.info(f"Session {session_id} fully cleaned up.")


async def _forward_client_to_gemini(
    ws: WebSocket,
    live_session: LiveSession,
    user_session,
) -> None:
    """Client audio/images/text → Gemini. Runs until client disconnects."""
    try:
        while live_session.is_active:
            try:
                message = await ws.receive()
            except WebSocketDisconnect:
                raise
            except RuntimeError:
                # "Cannot call receive once a disconnect message has been received"
                break

            user_session.touch()

            # Binary frame = raw PCM audio
            if "bytes" in message and message["bytes"]:
                await live_session.send_audio(message["bytes"])

            # Text frame = JSON command
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
                        await live_session.send_image(image_bytes)
                        user_session.log_turn("user", "image")
                        await firestore.log_turn(
                            user_session.session_id, "user", "image"
                        )

                elif msg_type == "text":
                    text = msg.get("text", "")
                    if text:
                        await live_session.send_text(text)
                        user_session.log_turn("user", "text", text)
                        await firestore.log_turn(
                            user_session.session_id, "user", "text", text
                        )

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from session {user_session.session_id}")
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
) -> None:
    """Gemini responses → Client. Runs until Gemini stream ends."""
    try:
        async for event in live_session.receive():
            user_session.touch()
            event_type = event["type"]

            try:
                if event_type == "audio":
                    await ws.send_bytes(event["data"])

                elif event_type == "text":
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
                    await ws.send_json({"type": "interrupted"})
                    logger.debug(f"Session {user_session.session_id}: interrupted")

                elif event_type == "turn_complete":
                    await ws.send_json({"type": "turn_complete"})

                elif event_type == "tool_call":
                    logger.info(f"Tool call: {event['tool_call']}")

            except (WebSocketDisconnect, RuntimeError):
                # Client gone, stop forwarding
                break

    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.error(f"Gemini→Client error: {e}")
        raise