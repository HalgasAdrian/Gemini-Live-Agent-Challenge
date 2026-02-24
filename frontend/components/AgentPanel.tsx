"use client";

import React, { useState, useCallback, useRef } from "react";
import { useWebSocket, WSMessage } from "@/hooks/useWebSocket";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import AgentSelector from "./AgentSelector";
import StatusBar from "./StatusBar";
import TranscriptView, { TranscriptEntry } from "./TranscriptView";
import Controls from "./Controls";

type SessionState = "idle" | "active";

export default function AgentPanel() {
  // ---- State ----
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [agentName, setAgentName] = useState("general");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const sessionIdRef = useRef<string>("");

  // Buffer to accumulate streaming transcript chunks
  const assistantBufferRef = useRef<string>("");

  // ---- Helpers ----
  const addEntry = useCallback(
    (role: "user" | "assistant" | "system", text: string) => {
      setTranscript((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role,
          text,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  // ---- Audio Playback ----
  const { playChunk, flush: flushAudio } = useAudioPlayback();

  // ---- WebSocket ----
  const handleAudioChunk = useCallback(
    (data: ArrayBuffer) => {
      playChunk(data);
    },
    [playChunk]
  );

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "session_ready":
          setAgentName(msg.agent || "general");
          addEntry("system", `Connected to ${msg.agent || "general"} agent.`);
          break;

        case "transcript":
          // Accumulate streaming text, we'll flush on turn_complete
          assistantBufferRef.current += (msg.text || "");
          break;

        case "turn_complete":
          // Flush accumulated transcript
          if (assistantBufferRef.current) {
            addEntry("assistant", assistantBufferRef.current);
            assistantBufferRef.current = "";
          }
          break;

        case "interrupted":
          flushAudio();
          // Flush whatever partial transcript we had
          if (assistantBufferRef.current) {
            addEntry("assistant", assistantBufferRef.current + " [interrupted]");
            assistantBufferRef.current = "";
          }
          break;

        case "error":
          addEntry("system", `Error: ${msg.message}`);
          break;
      }
    },
    [addEntry, flushAudio]
  );

  const handleDisconnect = useCallback(() => {
    setSessionState("idle");
    addEntry("system", "Session ended.");
  }, [addEntry]);

  const {
    status: wsStatus,
    connect,
    disconnect,
    sendAudio,
    sendImage,
    sendText,
  } = useWebSocket({
    onAudioChunk: handleAudioChunk,
    onMessage: handleMessage,
    onDisconnect: handleDisconnect,
  });

  // ---- Mic ----
  const { start: startMic, stop: stopMic, isCapturing: isMicActive } =
    useAudioCapture(sendAudio);

  // ---- Camera ----
  const {
    videoRef,
    start: startCamera,
    stop: stopCamera,
    isActive: isCameraActive,
  } = useCameraCapture(sendImage);

  // ---- Actions ----
  const handleStart = useCallback(
    (presetId: string) => {
      const sessionId = crypto.randomUUID();
      sessionIdRef.current = sessionId;
      setSessionState("active");
      setTranscript([]);
      setAgentName(presetId);
      connect(sessionId, presetId);
    },
    [connect]
  );

  const handleToggleMic = useCallback(async () => {
    if (isMicActive) {
      stopMic();
    } else {
      await startMic();
    }
  }, [isMicActive, startMic, stopMic]);

  const handleToggleCamera = useCallback(async () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isCameraActive, startCamera, stopCamera]);

  const handleEndSession = useCallback(() => {
    stopMic();
    stopCamera();
    disconnect();
    setSessionState("idle");
  }, [stopMic, stopCamera, disconnect]);

  const handleSendText = useCallback(
    (text: string) => {
      sendText(text);
      addEntry("user", text);
    },
    [sendText, addEntry]
  );

  // ---- Render ----
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <StatusBar
        wsStatus={wsStatus}
        agentName={agentName}
        isMicActive={isMicActive}
        isCameraActive={isCameraActive}
      />

      {sessionState === "idle" ? (
        <AgentSelector onStart={handleStart} />
      ) : (
        <>
          {/* Camera preview (shown when camera is active) */}
          {isCameraActive && (
            <div className="flex justify-center bg-black py-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-48 h-36 rounded-lg object-cover border border-gray-700"
              />
            </div>
          )}

          <TranscriptView entries={transcript} />

          <Controls
            isMicActive={isMicActive}
            isCameraActive={isCameraActive}
            isConnected={wsStatus === "connected"}
            onToggleMic={handleToggleMic}
            onToggleCamera={handleToggleCamera}
            onEndSession={handleEndSession}
            onSendText={handleSendText}
          />
        </>
      )}
    </div>
  );
}
