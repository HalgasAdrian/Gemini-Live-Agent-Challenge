import { useRef, useCallback } from "react";
import { AUDIO_RECEIVE_SAMPLE_RATE } from "@/lib/constants";

export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const gainNodeRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const getContext = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const ctx = new AudioContext({ sampleRate: AUDIO_RECEIVE_SAMPLE_RATE });
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      ctxRef.current = ctx;
      gainNodeRef.current = gain;
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playChunk = useCallback(
    (pcmData: ArrayBuffer) => {
      const ctx = getContext();
      const gain = gainNodeRef.current!;

      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(1.0, ctx.currentTime);

      const int16 = new Int16Array(pcmData);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, AUDIO_RECEIVE_SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextTimeRef.current);
      source.start(startTime);
      nextTimeRef.current = startTime + buffer.duration;
      isPlayingRef.current = true;

      activeSourcesRef.current.add(source);
      source.onended = () => {
        activeSourcesRef.current.delete(source);
        if (activeSourcesRef.current.size === 0 && nextTimeRef.current <= ctx.currentTime + 0.05) {
          isPlayingRef.current = false;
        }
      };
    },
    [getContext]
  );

  const fadeOut = useCallback(() => {
    const ctx = ctxRef.current;
    const gain = gainNodeRef.current;
    if (!ctx || !gain) return;

    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.18);

    setTimeout(() => {
      activeSourcesRef.current.forEach((source) => {
        try { source.stop(); } catch {}
      });
      activeSourcesRef.current.clear();
      nextTimeRef.current = 0;
      isPlayingRef.current = false;

      if (gain && ctx.state !== "closed") {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(1.0, ctx.currentTime);
      }
    }, 200);
  }, []);

  const flush = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
      gainNodeRef.current = null;
    }
    activeSourcesRef.current.clear();
    nextTimeRef.current = 0;
    isPlayingRef.current = false;
  }, []);

  return { playChunk, fadeOut, flush, isPlayingRef };
}