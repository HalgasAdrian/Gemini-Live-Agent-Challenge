import { useRef, useState, useCallback } from "react";
import { CAMERA_FRAME_INTERVAL_MS } from "@/lib/constants";

/**
 * Captures camera frames as base64-encoded JPEGs at a set interval.
 */
export function useCameraCapture(
  onFrame: (base64Jpeg: string) => void
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  const frameCountRef = useRef(0);

  const start = useCallback(async () => {
    try {
      console.log("📷 Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
      });
      console.log("📷 Camera access granted:", stream.getVideoTracks()[0].label);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        console.log("📷 Video element playing");
      } else {
        console.warn("📷 videoRef is null — video element not mounted!");
      }

      streamRef.current = stream;

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;

      frameCountRef.current = 0;

      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) {
          console.warn("📷 Frame skipped: refs not ready");
          return;
        }

        // Check video is actually producing frames
        if (videoRef.current.readyState < 2) {
          console.warn("📷 Frame skipped: video not ready (readyState:", videoRef.current.readyState, ")");
          return;
        }

        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];

        frameCountRef.current++;
        if (frameCountRef.current <= 3 || frameCountRef.current % 10 === 0) {
          console.log(`📷 Frame #${frameCountRef.current} captured: ${base64.length} chars base64`);
        }

        onFrame(base64);
      }, CAMERA_FRAME_INTERVAL_MS);

      setIsActive(true);
      console.log(`📷 Camera capture started (interval: ${CAMERA_FRAME_INTERVAL_MS}ms)`);
    } catch (err) {
      console.error("📷 Camera access error:", err);
      throw err;
    }
  }, [onFrame]);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    intervalRef.current = null;
    streamRef.current = null;
    setIsActive(false);
    console.log(`📷 Camera stopped after ${frameCountRef.current} frames`);
  }, []);

  return { videoRef, start, stop, isActive };
}
