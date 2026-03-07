import React, { useState } from "react";
import AudioVisualizer from "./AudioVisualizer";

interface ControlsProps {
  isMicActive: boolean;
  isCameraActive: boolean;
  isConnected: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEndSession: () => void;
  onSendText: (text: string) => void;
}

export default function Controls({
  isMicActive,
  isCameraActive,
  isConnected,
  onToggleMic,
  onToggleCamera,
  onEndSession,
  onSendText,
}: ControlsProps) {
  const [textInput, setTextInput] = useState("");

  const handleTextSend = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {/* Visualizer stays small on the left */}
        <AudioVisualizer isActive={isMicActive} />
        
        {/* Buttons Grouped on the right */}
        <div className="flex gap-2">
          <button
            onClick={onToggleMic}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
              isMicActive ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {isMicActive ? "🎙️" : "mute"}
          </button>
          <button
            onClick={onToggleCamera}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
              isCameraActive ? "bg-green-600 text-white shadow-lg shadow-green-900/40" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            📷
          </button>
          <button
            onClick={onEndSession}
            className="w-10 h-10 rounded-full bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white transition-all text-sm font-bold"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
          placeholder="Type a message..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
  );
}
