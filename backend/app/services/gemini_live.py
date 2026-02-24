"""
Gemini Live API wrapper.

Handles session creation, bidirectional streaming, tool execution,
and interruption management. This is the core of the agent.
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

# ---- Initialize the Gemini client (singleton) ----

_client: genai.Client | None = None


def get_gemini_client() -> genai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


# ---- Live session wrapper ----


class LiveSession:
    """
    Wraps a single Gemini Live API session with convenience methods
    for sending audio, video frames, and text, and receiving responses.
    """

    def __init__(self, session, preset: AgentPreset):
        self.session = session
        self.preset = preset
        self.created_at = time.time()
        self.is_active = True
        self.turn_count = 0

    async def send_audio(self, audio_data: bytes) -> None:
        """Send a chunk of PCM audio (16-bit, 16kHz, mono)."""
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
        """Send a video/camera frame."""
        if not self.is_active:
            return
        try:
            await self.session.send(
                input=types.LiveClientRealtimeInput(
                    media_chunks=[
                        types.Blob(
                            data=image_data,
                            mime_type=mime_type,
                        )
                    ]
                )
            )
        except Exception as e:
            logger.error(f"Error sending image: {e}")
            raise

    async def send_text(self, text: str) -> None:
        """Send a text message (for text-based interaction or context injection)."""
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

        Yields dicts with structure:
            {"type": "audio", "data": bytes}
            {"type": "text", "text": str}
            {"type": "input_transcript", "text": str}
            {"type": "interrupted"}
            {"type": "turn_complete"}
            {"type": "tool_call", "tool_call": ...}
        """
        try:
            async for response in self.session.receive():
                # --- Handle server content (audio/text responses) ---
                if response.server_content:
                    sc = response.server_content

                    # Check for interruption
                    if sc.interrupted:
                        yield {"type": "interrupted"}
                        continue

                    # Process model output parts (audio data)
                    if sc.model_turn and sc.model_turn.parts:
                        for part in sc.model_turn.parts:
                            # Audio response
                            if part.inline_data and part.inline_data.data:
                                yield {
                                    "type": "audio",
                                    "data": part.inline_data.data,
                                }
                            # Text part (fallback, some models still send this)
                            if part.text:
                                yield {
                                    "type": "text",
                                    "text": part.text,
                                }

                    # Output audio transcription (agent's speech as text)
                    if sc.output_transcription and sc.output_transcription.text:
                        yield {
                            "type": "text",
                            "text": sc.output_transcription.text,
                        }

                    # Input audio transcription (user's speech as text)
                    if sc.input_transcription and sc.input_transcription.text:
                        yield {
                            "type": "input_transcript",
                            "text": sc.input_transcription.text,
                        }

                    # Turn complete signal
                    if sc.turn_complete:
                        self.turn_count += 1
                        yield {"type": "turn_complete"}

                # --- Handle tool calls ---
                if response.tool_call:
                    yield {
                        "type": "tool_call",
                        "tool_call": response.tool_call,
                    }

        except Exception as e:
            logger.error(f"Error in receive loop: {e}")
            self.is_active = False
            raise

    async def send_tool_response(self, function_responses: list) -> None:
        """Send tool/function call results back to Gemini."""
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
        """Close the Live API session."""
        self.is_active = False
        # No explicit close needed — the context manager in ws.py handles it


def build_live_config(preset: AgentPreset) -> dict:
    """
    Build the live connection config for a given agent preset.
    Uses dict format for maximum compatibility with the native audio model.
    
    The native audio model (gemini-2.5-flash-native-audio-preview-12-2025):
      - Only supports "AUDIO" as response modality (not "TEXT")
      - Returns text via output_audio_transcription
      - Input text transcription via input_audio_transcription
    """
    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": preset.system_prompt,
        # Get text transcripts of both input and output audio
        "output_audio_transcription": {},
        "input_audio_transcription": {},
    }

    # Add tools if enabled
    tools = []
    if "google_search" in preset.tools_enabled:
        tools.append(types.Tool(google_search=types.GoogleSearch()))
    if tools:
        config["tools"] = tools

    return config