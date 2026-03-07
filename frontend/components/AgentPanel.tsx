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
        if (msg.text && msg.text.trim()) addEntry("user", msg.text);
        break;
      case "turn_complete":
        if (assistantBufferRef.current) {
          addEntry("assistant", assistantBufferRef.current);
          assistantBufferRef.current = "";
        }
        break;
      case "interrupted":
        flushAudio();
        assistantBufferRef.current = "";
        break;
    }
  }, [addEntry, flushAudio]);

  const { status: wsStatus, connect, disconnect, sendAudio, sendImage, sendText } = useWebSocket({
    onAudioChunk: playChunk,
    onMessage: handleMessage,
    onDisconnect: () => setSessionState("idle"),
  });

  const { start: startMic, stop: stopMic, isCapturing: isMicActive } = useAudioCapture(sendAudio);
  const { videoRef, start: startCamera, stop: stopCamera, isActive: isCameraActive } = useCameraCapture(sendImage);

  const handleStart = (presetId: string) => {
    const sessionId = crypto.randomUUID();
    setSessionState("active");
    setTranscript([]);
    connect(sessionId, presetId);
  };

  const handleEndSession = () => {
    stopMic();
    stopCamera();
    disconnect();
    setSessionState("idle");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <StatusBar wsStatus={wsStatus} agentName={agentName} isMicActive={isMicActive} isCameraActive={isCameraActive} />

      {sessionState === "idle" ? (
        <AgentSelector onStart={handleStart} />
      ) : (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          <TranscriptView entries={transcript} />

          {/* BOTTOM RIGHT GROUPED BOX */}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80 items-end">
            
            {/* Camera Preview (Shrunken and Stacked) */}
            {isCameraActive && (
              <div className="relative w-48 h-36 overflow-hidden rounded-2xl border-2 border-gray-800 bg-black shadow-2xl">
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-white font-bold">LIVE</span>
                </div>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            )}

            {/* Controls Box (Mic, Cam Toggle, End, Input) */}
            <div className="w-full bg-gray-900/90 backdrop-blur-xl p-4 rounded-[24px] border border-gray-800 shadow-2xl">
              <Controls
                isMicActive={isMicActive}
                isCameraActive={isCameraActive}
                isConnected={wsStatus === "connected"}
                onToggleMic={async () => (isMicActive ? stopMic() : startMic())}
                onToggleCamera={async () => (isCameraActive ? stopCamera() : startCamera())}
                onEndSession={handleEndSession}
                onSendText={(text) => { sendText(text); addEntry("user", text); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}