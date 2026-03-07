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
import AgentStateIndicator, { AgentState } from "./AgentStateIndicator";

type SessionState = "idle" | "active";

export default function AgentPanel() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [agentName, setAgentName] = useState("general");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const sessionIdRef = useRef<string>("");
  const assistantBufferRef = useRef<string>("");

  const agentSpeakingRef = useRef(false);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { playChunk, fadeOut, flush: flushAudio } = useAudioPlayback();

  const handleAudioChunk = useCallback(
    (data: ArrayBuffer) => {
      playChunk(data);
      agentSpeakingRef.current = true;
      setAgentState("speaking");
    },
    [playChunk]
  );

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "session_ready":
          setAgentName(msg.agent || "general");
          setAgentState("listening");
          addEntry("system", `Connected to ${msg.agent || "general"} agent.`);
          break;

        case "transcript":
          assistantBufferRef.current += (msg.text || "");
          setAgentState("speaking");
          break;

        case "input_transcript":
          if (msg.text && msg.text.trim()) {
            addEntry("user", msg.text);
          }
          break;

        case "turn_complete":
          agentSpeakingRef.current = false;
          if (assistantBufferRef.current) {
            addEntry("assistant", assistantBufferRef.current);
            assistantBufferRef.current = "";
          }
          setAgentState("idle");
          setTimeout(() => setAgentState("listening"), 300);
          break;

        case "interrupted":
          fadeOut();
          agentSpeakingRef.current = false;

          if (assistantBufferRef.current) {
            addEntry("assistant", assistantBufferRef.current.trimEnd() + " ...");
            assistantBufferRef.current = "";
          }

          setAgentState("listening");
          break;

        case "error":
          addEntry("system", `Error: ${msg.message}`);
          setAgentState("idle");
          break;
      }
    },
    [addEntry, fadeOut]
  );

  const handleDisconnect = useCallback(() => {
    setSessionState("idle");
    setAgentState("idle");
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

  const handleAudioCapture = useCallback(
    (pcmBuffer: ArrayBuffer) => {
      sendAudio(pcmBuffer);

      if (agentSpeakingRef.current) {
        if (interruptTimerRef.current) {
          clearTimeout(interruptTimerRef.current);
        }
        interruptTimerRef.current = setTimeout(() => {
          if (agentSpeakingRef.current) {
            setAgentState("listening");
          }
        }, 300);
      }
    },
    [sendAudio]
  );

  const { start: startMic, stop: stopMic, isCapturing: isMicActive } =
    useAudioCapture(handleAudioCapture);

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
      setAgentState("idle");
      connect(sessionId, presetId);
    },
    [connect]
  );

  const handleToggleMic = useCallback(async () => {
    if (isMicActive) {
      stopMic();
    } else {
      await startMic();
      setAgentState("listening");
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
    if (interruptTimerRef.current) {
      clearTimeout(interruptTimerRef.current);
    }
    stopMic();
    stopCamera();
    flushAudio();
    disconnect();
    setSessionState("idle");
    setAgentState("idle");
  }, [stopMic, stopCamera, flushAudio, disconnect]);

  const handleSendText = useCallback(
    (text: string) => {
      sendText(text);
      addEntry("user", text);
      setAgentState("thinking");
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
          <AgentStateIndicator state={agentState} />

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