import { useRef, useState, useCallback } from "react";
import { BACKEND_WS_URL } from "@/lib/constants";

export type WSStatus = "disconnected" | "connecting" | "connected" | "error";

export interface WSMessage {
  type: "transcript" | "input_transcript" | "interrupted" | "turn_complete" | "session_ready" | "error";
  text?: string;
  session_id?: string;
  agent?: string;
  message?: string;
}

interface UseWebSocketOptions {
  onAudioChunk: (data: ArrayBuffer) => void;
  onMessage: (msg: WSMessage) => void;
  onDisconnect?: () => void;
}

export function useWebSocket({
  onAudioChunk,
  onMessage,
  onDisconnect,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WSStatus>("disconnected");

  const connect = useCallback(
    (sessionId: string, preset: string = "general") => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      setStatus("connecting");
      const ws = new WebSocket(`${BACKEND_WS_URL}/ws/session/${sessionId}`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setStatus("connected");
        ws.send(JSON.stringify({ type: "config", preset }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          onAudioChunk(event.data);
        } else {
          try {
            const msg: WSMessage = JSON.parse(event.data);
            onMessage(msg);
          } catch (e) {
            console.warn("Invalid WS message:", event.data);
          }
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setStatus("error");
      };

      ws.onclose = () => {
        setStatus("disconnected");
        onDisconnect?.();
      };

      wsRef.current = ws;
    },
    [onAudioChunk, onMessage, onDisconnect]
  );

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendAudio = useCallback((buffer: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(buffer);
    }
  }, []);

  const sendImage = useCallback((base64Jpeg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "image", data: base64Jpeg }));
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
    }
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendAudio,
    sendImage,
    sendText,
  };
}
