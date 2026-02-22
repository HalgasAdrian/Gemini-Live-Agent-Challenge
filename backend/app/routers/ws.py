"""
WebSocket endpoint — the heart of the real-time agent.

Protocol (client ↔ server):

CLIENT → SERVER:
  - Binary frame:    Raw PCM audio (16-bit, 16kHz, mono)
  - JSON text frame: {
      "type": "config",       → Set agent preset before starting
      "preset": "tutor"
    }
  - JSON text frame: {
      "type": "image",        → Camera frame
      "data": "<base64 JPEG>"
    }
  - JSON text frame: {
      "type": "text",         → Text message (non-voice input)
      "text": "hello"
    }

SERVER → CLIENT:
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
from app.services.gemini_live import create_live_session
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
    2. Server creates a Gemini Live session
    3. Two concurrent loops run:
       - forward_client_to_gemini: client audio/images → Gemini
       - forward_gemini_to_client: Gemini responses → client
    4. On disconnect, everything is cleaned up
    """
    await ws.accept()
    logger.info(f"WebSocket connected: {session_id}")

    user_session = session_manager.register(session_id)
    preset_id = "general"  # Default, can be overridden by first message

    try:
        # ---- Step 1: Wait for optional config or start immediately ----
        # Give client 2 seconds to send a config message
        try:
            initial_msg = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
            msg = json.loads(initial_msg)
            if msg.get("type") == "config":
                preset_id = msg.get("preset", "general")
                logger.info(f"Session {session_id} configured with preset: {preset_id}")
        except asyncio.TimeoutError:
            pass  # No config sent, use default
        except Exception:
            pass  # Not a valid config message, proceed with default

        # ---- Step 2: Create Gemini Live session ----
        preset = get_agent_preset(preset_id)
        user_session.agent_preset_id = preset_id
        live_session = await create_live_session(preset)
        user_session.live_session = live_session

        # Log session start
        await firestore.log_session_start(session_id, preset_id)

        # Notify client that session is ready
        await ws.send_json({
            "type": "session_ready",
            "session_id": session_id,
            "agent": preset_id,
        })

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
    live_session,
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
                    # Camera frame: base64-encoded JPEG
                    image_b64 = msg.get("data", "")
                    if image_b64:
                        image_bytes = base64.b64decode(image_b64)
                        await live_session.send_image(image_bytes)
                        user_session.log_turn("user", "image")
                        await firestore.log_turn(
                            user_session.session_id, "user", "image"
                        )

                elif msg_type == "text":
                    # Text input (non-voice)
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
        logger.error(f"Client→Gemini forwarding error: {e}")
        raise


async def _forward_gemini_to_client(
    ws: WebSocket,
    live_session,
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
                # Stream audio bytes directly to client
                await ws.send_bytes(event["data"])

            elif event_type == "text":
                # Send transcript as JSON
                await ws.send_json({
                    "type": "transcript",
                    "text": event["text"],
                })
                user_session.log_turn("assistant", "text", event["text"])
                await firestore.log_turn(
                    user_session.session_id, "assistant", "text", event["text"]
                )

            elif event_type == "interrupted":
                # Agent was interrupted by user speaking
                await ws.send_json({"type": "interrupted"})
                logger.debug(f"Session {user_session.session_id}: interrupted")

            elif event_type == "turn_complete":
                await ws.send_json({"type": "turn_complete"})

            elif event_type == "tool_call":
                # For now, log tool calls. Custom tool handling can be added here.
                logger.info(f"Tool call: {event['tool_call']}")
                # The Live API handles google_search automatically,
                # but for custom function calls you'd execute them and
                # send results back:
                # await live_session.send_tool_response([...])

    except WebSocketDisconnect:
        raise
    except Exception as e:
        logger.error(f"Gemini→Client forwarding error: {e}")
        raise
