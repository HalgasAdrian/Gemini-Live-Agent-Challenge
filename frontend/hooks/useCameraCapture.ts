import { useRef, useState, useCallback } from "react";
import { CAMERA_FRAME_INTERVAL_MS } from "@/lib/constants";

/**
 * Captures camera frames as base64-encoded JPEGs at a set interval.
 *
 * Usage:
 *   const { videoRef, start, stop, isActive } = useCameraCapture(onFrame);
 *   // Attach videoRef to a <video> element for preview
 */
export function useCameraCapture(
  onFrame: (base64Jpeg: string) => void
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isActive, setIsActive] = useState(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      streamRef.current = stream;

      // Create offscreen canvas for frame capture
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;

      // Capture frames at interval
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.7);
        // Strip "data:image/jpeg;base64," prefix
        const base64 = dataUrl.split(",")[1];
        onFrame(base64);
      }, CAMERA_FRAME_INTERVAL_MS);

      setIsActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
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
  }, []);

  return { videoRef, start, stop, isActive };
}
