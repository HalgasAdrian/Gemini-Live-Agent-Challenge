import React from "react";
import { WSStatus } from "@/hooks/useWebSocket";

const STATUS_CONFIG: Record<WSStatus, { label: string; color: string }> = {
  disconnected: { label: "Disconnected", color: "bg-gray-400" },
  connecting: { label: "Connecting...", color: "bg-yellow-400" },
  connected: { label: "Connected", color: "bg-green-400" },
  error: { label: "Error", color: "bg-red-400" },
};

interface StatusBarProps {
  wsStatus: WSStatus;
  agentName: string;
  isMicActive: boolean;
  isCameraActive: boolean;
}

export default function StatusBar({
  wsStatus,
  agentName,
  isMicActive,
  isCameraActive,
}: StatusBarProps) {
  const { label, color } = STATUS_CONFIG[wsStatus];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
          {label}
        </span>
        {wsStatus === "connected" && (
          <span className="text-gray-400">Agent: {agentName}</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-gray-400">
        {isMicActive && <span>🎤 Mic On</span>}
        {isCameraActive && <span>📷 Cam On</span>}
      </div>
    </div>
  );
}
