export const BACKEND_WS_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://localhost:8080";

export const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8080";

export const AUDIO_SEND_SAMPLE_RATE = 16000;    // What Gemini expects for INPUT
export const AUDIO_RECEIVE_SAMPLE_RATE = 24000; // What Gemini sends as OUTPUT
export const AUDIO_CHANNELS = 1;                // Mono
export const AUDIO_CHUNK_SIZE = 4096;           // Samples per chunk

// How often to send camera frames (ms) — don't flood the API
export const CAMERA_FRAME_INTERVAL_MS = 1000;