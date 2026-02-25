"""
Gemini Live API wrapper.
"""

import asyncio
import logging
import os
import time

from google import genai
from google.genai import types

from app.config import get_settings
from app.agents.presets import AgentPreset

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


class LiveSession:
    """Wraps a Gemini Live API session."""

    def __init__(self, session, preset: AgentPreset):
        self.session = session
        self.preset = preset
        self.created_at = time.time()
        self.is_active = True
        self.turn_count = 0

    async def send_audio(self, audio_data: bytes) -> None:
        if not self.is_active:
            return
        try:
            await self.session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[
                        types.Blob(
                            data=audio_data,
                            mime_type="audio/pcm;rate=16000",
                        )
                    ]
                )
            )
        except Exception as e:
            logger.error(f"Error sending audio: {e}")
            self.is_active = False
            raise

    async def send_image(self, image_data: bytes, mime_type: str = "image/jpeg") -> None:
        if not self.is_active:
            return
        try:
            await self.session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[
                        types.Blob(data=image_data, mime_type=mime_type)
                    ]
                )
            )
        except Exception as e:
            logger.error(f"Error sending image: {e}")
            raise

    async def send_text(self, text: str) -> None:
        if not self.is_active:
            return
        try:
            await self.session.send(
                input=types.LiveClientContent(
                    turns=[
                        types.Content(
                            role="user",
                            parts=[types.Part(text=text)],
                        )
                    ],
                    turn_complete=True,
                )
            )
        except Exception as e:
            logger.error(f"Error sending text: {e}")
            raise

    async def receive(self):
        """
        Async generator that yields parsed response events from Gemini.
        Uses safe attribute access to handle varying response shapes
        across different model versions.
        """
        try:
            async for response in self.session.receive():
                try:
                    sc = getattr(response, "server_content", None)

                    if sc is not None:
                        # Check for interruption
                        if getattr(sc, "interrupted", False):
                            yield {"type": "interrupted"}
                            continue

                        # Process model output parts (audio data)
                        model_turn = getattr(sc, "model_turn", None)
                        if model_turn and getattr(model_turn, "parts", None):
                            for part in model_turn.parts:
                                inline = getattr(part, "inline_data", None)
                                if inline and getattr(inline, "data", None):
                                    yield {"type": "audio", "data": inline.data}

                                text = getattr(part, "text", None)
                                if text:
                                    yield {"type": "text", "text": text}

                        # Output transcription (agent's speech → text)
                        out_t = getattr(sc, "output_transcription", None)
                        if out_t and getattr(out_t, "text", None):
                            yield {"type": "text", "text": out_t.text}

                        # Input transcription (user's speech → text)
                        in_t = getattr(sc, "input_transcription", None)
                        if in_t and getattr(in_t, "text", None):
                            yield {"type": "input_transcript", "text": in_t.text}

                        # Turn complete
                        if getattr(sc, "turn_complete", False):
                            self.turn_count += 1
                            yield {"type": "turn_complete"}

                    # Handle tool calls
                    tc = getattr(response, "tool_call", None)
                    if tc:
                        yield {"type": "tool_call", "tool_call": tc}

                except Exception as inner_e:
                    # Log but don't crash — one bad message shouldn't kill the session
                    logger.warning(f"Error processing Gemini response: {inner_e}")
                    continue

        except Exception as e:
            logger.error(f"Gemini receive stream ended: {e}")
            self.is_active = False
            raise

    async def send_tool_response(self, function_responses: list) -> None:
        try:
            await self.session.send(
                input=types.LiveClientToolResponse(
                    function_responses=function_responses
                )
            )
        except Exception as e:
            logger.error(f"Error sending tool response: {e}")
            raise

    async def close(self) -> None:
        self.is_active = False


def build_live_config(preset: AgentPreset) -> dict:
    """
    Build the live connection config for a given agent preset.
    Uses dict format for maximum compatibility with the native audio model.
    """
    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": preset.system_prompt,
        "output_audio_transcription": {},
        "input_audio_transcription": {},
    }

    tools = []
    if "google_search" in preset.tools_enabled:
        tools.append(types.Tool(google_search=types.GoogleSearch()))
    if tools:
        config["tools"] = tools

    return config