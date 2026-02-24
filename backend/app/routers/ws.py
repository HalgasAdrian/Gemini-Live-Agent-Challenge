"""
WebSocket endpoint — the heart of the real-time agent.

Protocol (client <-> server):

CLIENT -> SERVER:
  - Binary frame:    Raw PCM audio (16-bit, 16kHz, mono)
  - JSON text frame: {"type": "config", "preset": "tutor"}
  - JSON text frame: {"type": "image", "data": "<base64 JPEG>"}
  - JSON text frame: {"type": "text", "text": "hello"}

SERVER -> CLIENT:
  - Binary frame:    PCM audio response chunks
  - JSON text frame: {"type": "transcript",    "text": "..."}
  - JSON text frame: {"type": "interrupted"}
  - JSON text frame: {"type": "turn_complete"}
  - JSON text frame: {"type": "error",         "message": "..."}
  - JSON text frame: {"type": "session_ready",  "session_id": "..."}
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
    """
    Main WebSocket handler for a live agent session.

    Lifecycle:
    1. Client connects, optionally sends a config message with preset choice
    2. Server creates a Gemini Live session via async context manager
    3. Two concurrent loops run:
       - forward_client_to_gemini: client audio/images -> Gemini
       - forward_gemini_to_client: Gemini responses -> client
    4. On disconnect, everything is cleaned up
    """
    await ws.accept()
    logger.info(f"WebSocket connected: {session_id}")

    user_session = session_manager.register(session_id)
    preset_id = "general"

    try:
        # ---- Step 1: Wait for optional config or start immediately ----
        try:
            initial_msg = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
            msg = json.loads(initial_msg)
            if msg.get("type") == "config":
                preset_id = msg.get("preset", "general")
                logger.info(f"Session {session_id} configured with preset: {preset_id}")
        except asyncio.TimeoutError:
            pass
        except Exception:
            pass

        # ---- Step 2: Create Gemini Live session (context manager!) ----
        preset = get_agent_preset(preset_id)
        user_session.agent_preset_id = preset_id
        settings = __import__("app.config", fromlist=["get_settings"]).get_settings()

        client = get_gemini_client()
        config = build_live_config(preset)

        logger.info(f"Creating Gemini Live session with preset '{preset.name}'")

        async with client.aio.live.connect(
            model=settings.gemini_model,
            config=config,
        ) as gemini_session:
            # Wrap the raw session in our LiveSession helper
            live_session = LiveSession(session=gemini_session, preset=preset)
            user_session.live_session = live_session

            # Log session start
            await firestore.log_session_start(session_id, preset_id)

            # Notify client that session is ready
            await ws.send_json({
                "type": "session_ready",
                "session_id": session_id,
                "agent": preset_id,
            })

            logger.info(f"Session {session_id} is live!")

            # ---- Step 3: Run bidirectional streaming ----
            await asyncio.gather(
                _forward_client_to_gemini(ws, live_session, user_session),
                _forward_gemini_to_client(ws, live_session, user_session),
            )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"Session {session_id} error: {e}", exc_info=True)
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # ---- Step 4: Cleanup ----
        turn_count = len(user_session.turns)
        await firestore.log_session_end(session_id, turn_count)
        await session_manager.remove(session_id)
        logger.info(f"Session {session_id} fully cleaned up.")


async def _forward_client_to_gemini(
    ws: WebSocket,
    live_session: LiveSession,
    user_session,
) -> None:
    """
    Reads messages from the WebSocket client and forwards them to Gemini.
    Handles audio (binary), images (JSON+base64), and text (JSON).
    """
    try:
        while live_session.is_active:
            message = await ws.receive()
            user_session.touch()

            # --- Binary frame = raw PCM audio ---
            if "bytes" in message and message["bytes"]:
                audio_data = message["bytes"]
                await live_session.send_audio(audio_data)

            # --- Text frame = JSON command ---
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
        raise
    except Exception as e:
        logger.error(f"Client->Gemini forwarding error: {e}")
        raise


async def _forward_gemini_to_client(
    ws: WebSocket,
    live_session: LiveSession,
    user_session,
) -> None:
    """
    Reads response events from Gemini and forwards them to the WebSocket client.
    Handles audio, text transcripts, interruptions, and turn completion.
    """
    try:
        async for event in live_session.receive():
            user_session.touch()
            event_type = event["type"]

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

            elif event_type == "interrupted":
                await ws.send_json({"type": "interrupted"})
                logger.debug(f"Session {user_session.session_id}: interrupted")

            elif event_type == "input_transcript":
                # User's speech transcribed to text
                await ws.send_json({
                    "type": "input_transcript",
                    "text": event["text"],
                })
                user_session.log_turn("user", "text", event["text"])
                await firestore.log_turn(
                    user_session.session_id, "user", "text", event["text"]
                )

            elif event_type == "turn_complete":
                await ws.send_json({"type": "turn_complete"})

            elif event_type == "tool_call":
                logger.info(f"Tool call: {event['tool_call']}")

    except WebSocketDisconnect:
        raise
    except Exception as e:
        logger.error(f"Gemini->Client forwarding error: {e}")
        raise