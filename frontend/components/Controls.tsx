import React from "react";
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
  const [textInput, setTextInput] = React.useState("");

  const handleTextSend = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Visualizer (Centered above buttons) */}
      <div className="flex justify-center h-8">
        <AudioVisualizer isActive={isMicActive} />
      </div>

      {/* 2. Main Action Buttons (Circular and Compact) */}
      <div className="flex items-center justify-between px-2">
        <button
          onClick={onToggleMic}
          disabled={!isConnected}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
            isMicActive
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          } disabled:opacity-40`}
          title={isMicActive ? "Mute" : "Unmute"}
        >
          {isMicActive ? "🎤" : "🔇"}
        </button>

        <button
          onClick={onToggleCamera}
          disabled={!isConnected}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
            isCameraActive
              ? "bg-green-600 text-white shadow-lg shadow-green-500/20"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          } disabled:opacity-40`}
          title={isCameraActive ? "Cam Off" : "Cam On"}
        >
          📷
        </button>

        <button
          onClick={onEndSession}
          disabled={!isConnected}
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white transition-all disabled:opacity-40"
          title="End session"
        >
          ✕
        </button>
      </div>

      {/* 3. Text Input (Full width of the widget) */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
            placeholder="Type a message..."
            disabled={!isConnected}
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-40"
          />
          <button
            onClick={handleTextSend}
            disabled={!isConnected || !textInput.trim()}
            className="absolute right-2 top-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
