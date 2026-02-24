import { useRef, useCallback } from "react";
import { AUDIO_RECEIVE_SAMPLE_RATE } from "@/lib/constants";

export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const isPlayingRef = useRef(false);

  const getContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext({ sampleRate: AUDIO_RECEIVE_SAMPLE_RATE });
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playChunk = useCallback(
    (pcmData: ArrayBuffer) => {
      const ctx = getContext();

      const int16 = new Int16Array(pcmData);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, AUDIO_RECEIVE_SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextTimeRef.current);
      source.start(startTime);
      nextTimeRef.current = startTime + buffer.duration;
      isPlayingRef.current = true;

      source.onended = () => {
        if (nextTimeRef.current <= ctx.currentTime + 0.05) {
          isPlayingRef.current = false;
        }
      };
    },
    [getContext]
  );

  const flush = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
    nextTimeRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  return { playChunk, flush, isPlayingRef };
}
