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

  const addEntry = useCallback((role: "user" | "assistant" | "system", text: string) => {
    setTranscript((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const { playChunk, flush: flushAudio } = useAudioPlayback();

  const handleAudioChunk = useCallback((data: ArrayBuffer) => {
    playChunk(data);
  }, [playChunk]);

  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "session_ready":
        setAgentName(msg.agent || "general");
        addEntry("system", `Connected to ${msg.agent || "general"} agent.`);
        break;
      case "transcript":
        assistantBufferRef.current += (msg.text || "");
        break;
      case "input_transcript":
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
  }, [addEntry, flushAudio]);

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

  const { start: startMic, stop: stopMic, isCapturing: isMicActive } = useAudioCapture(sendAudio);

  const {
    videoRef,
    start: startCamera,
    stop: stopCamera,
    isActive: isCameraActive,
  } = useCameraCapture(sendImage);

  const handleStart = useCallback((presetId: string) => {
    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    setSessionState("active");
    setTranscript([]);
    setAgentName(presetId);
    connect(sessionId, presetId);
  }, [connect]);

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

  const handleSendText = useCallback((text: string) => {
    sendText(text);
    addEntry("user", text);
  }, [sendText, addEntry]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <StatusBar
        wsStatus={wsStatus}
        agentName={agentName}
        isMicActive={isMicActive}
        isCameraActive={isCameraActive}
      />

      {sessionState === "idle" ? (
        <AgentSelector onStart={handleStart} />
      ) : (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          
          <div className="flex-1 overflow-hidden">
             <TranscriptView entries={transcript} />
          </div>

          {/* MAIN CONTAINER: Centered at the bottom */}
          <div className="fixed bottom-8 left-0 right-0 z-50 flex justify-center px-4">
            <div className="w-full max-w-md flex flex-col items-center gap-4 bg-gray-900/95 backdrop-blur-xl p-6 rounded-[32px] border border-gray-800 shadow-2xl">
              
              {/* CAMERA AREA: We use a wrapper to ensure centering */}
              {isCameraActive && (
                <div className="w-full flex justify-center mb-2">
                  <div className="relative w-40 h-28 overflow-hidden rounded-xl border border-gray-700 bg-black shadow-lg">
                    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5 border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[8px] text-white font-bold">LIVE</span>
                    </div>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* CONTROLS COMPONENT */}
              <div className="w-full">
                <Controls
                  isMicActive={isMicActive}
                  isCameraActive={isCameraActive}
                  isConnected={wsStatus === "connected"}
                  onToggleMic={handleToggleMic}
                  onToggleCamera={handleToggleCamera}
                  onEndSession={handleEndSession}
                  onSendText={handleSendText}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}