import { useRef, useState, useCallback } from "react";
import { AUDIO_SEND_SAMPLE_RATE, AUDIO_CHUNK_SIZE } from "@/lib/constants";

export function useAudioCapture(
  onChunk: (pcmBuffer: ArrayBuffer) => void
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SEND_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const ctx = new AudioContext({ sampleRate: AUDIO_SEND_SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(AUDIO_CHUNK_SIZE, 1, 1);

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onChunk(int16.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      audioContextRef.current = ctx;
      streamRef.current = stream;
      processorRef.current = processor;
      setIsCapturing(true);
    } catch (err) {
      console.error("Mic access error:", err);
      throw err;
    }
  }, [onChunk]);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    processorRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    setIsCapturing(false);
  }, []);

  return { start, stop, isCapturing };
}
