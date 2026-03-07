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
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [agentName, setAgentName] = useState("general");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const sessionIdRef = useRef<string>("");
  const assistantBufferRef = useRef<string>("");

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

  const { playChunk, flush: flushAudio } = useAudioPlayback();

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
          // Accumulate streaming agent transcript
          assistantBufferRef.current += (msg.text || "");
          break;

        case "input_transcript":
          // User's speech transcribed — show in chat
          if (msg.text && msg.text.trim()) {
            addEntry("user", msg.text);
          }
          break;

        case "turn_complete":
          if (assistantBufferRef.current) {
            addEntry("assistant", assistantBufferRef.current);
            assistantBufferRef.current = "";
          }
          break;

        case "interrupted":
          flushAudio();
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

  const { start: startMic, stop: stopMic, isCapturing: isMicActive } =
    useAudioCapture(sendAudio);

  const {
    videoRef,
    start: startCamera,
    stop: stopCamera,
    isActive: isCameraActive,
  } = useCameraCapture(sendImage);

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
          {/* Camera preview — fixed position, never moves regardless of scroll */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`fixed bottom-32 right-4 z-50 w-48 h-36 rounded-xl object-cover border-2 border-gray-600 shadow-lg shadow-black/50 ${isCameraActive ? "" : "hidden"}`}
          />
          {isCameraActive && (
            <div className="fixed bottom-[10.5rem] right-5 z-50 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-white font-medium">LIVE</span>
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
