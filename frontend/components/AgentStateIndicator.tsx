import React, { useEffect, useState } from "react";

export type AgentState = "idle" | "listening" | "thinking" | "speaking";

interface AgentStateIndicatorProps {
  state: AgentState;
}

const STATE_CONFIG: Record<AgentState, {
  label: string;
  color: string;
  pulseColor: string;
  icon: string;
}> = {
  idle: {
    label: "Ready",
    color: "bg-gray-500",
    pulseColor: "",
    icon: "●",
  },
  listening: {
    label: "Listening...",
    color: "bg-blue-500",
    pulseColor: "bg-blue-400",
    icon: "◉",
  },
  thinking: {
    label: "Thinking...",
    color: "bg-amber-500",
    pulseColor: "bg-amber-400",
    icon: "◎",
  },
  speaking: {
    label: "Speaking",
    color: "bg-green-500",
    pulseColor: "bg-green-400",
    icon: "◉",
  },
};

export default function AgentStateIndicator({ state }: AgentStateIndicatorProps) {
  const { label, color, pulseColor, icon } = STATE_CONFIG[state];
  const [showListeningFlash, setShowListeningFlash] = useState(false);

  // Brief flash effect when transitioning to "listening" after interruption
  useEffect(() => {
    if (state === "listening") {
      setShowListeningFlash(true);
      const timer = setTimeout(() => setShowListeningFlash(false), 600);
      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
    <div
      className={`flex items-center justify-center gap-2 py-2 transition-all duration-300 ${
        showListeningFlash ? "bg-blue-500/10" : ""
      }`}
    >
      <div className="relative flex items-center gap-2">
        {/* Pulse ring for active states */}
        {state !== "idle" && (
          <span className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${pulseColor}`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${color}`}
            />
          </span>
        )}

        {state === "idle" && (
          <span className={`inline-flex rounded-full h-3 w-3 ${color}`} />
        )}

        <span
          className={`text-sm font-medium transition-colors duration-300 ${
            state === "listening"
              ? "text-blue-400"
              : state === "thinking"
                ? "text-amber-400"
                : state === "speaking"
                  ? "text-green-400"
                  : "text-gray-400"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}