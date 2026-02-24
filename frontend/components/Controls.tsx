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
    <div className="border-t border-gray-700 bg-gray-900 px-4 py-4 space-y-3">
      {/* Audio visualizer */}
      <div className="flex justify-center">
        <AudioVisualizer isActive={isMicActive} />
      </div>

      {/* Main controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Mic toggle */}
        <button
          onClick={onToggleMic}
          disabled={!isConnected}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
            isMicActive
              ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={isMicActive ? "Mute" : "Unmute"}
        >
          {isMicActive ? "🎤" : "🔇"}
        </button>

        {/* Camera toggle */}
        <button
          onClick={onToggleCamera}
          disabled={!isConnected}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
            isCameraActive
              ? "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/25"
              : "bg-gray-700 hover:bg-gray-600 text-gray-300"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={isCameraActive ? "Turn off camera" : "Turn on camera"}
        >
          {isCameraActive ? "📷" : "📷"}
        </button>

        {/* End session */}
        <button
          onClick={onEndSession}
          disabled={!isConnected}
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title="End session"
        >
          ✕
        </button>
      </div>

      {/* Text input fallback */}
      <div className="flex gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
          placeholder="Type a message instead..."
          disabled={!isConnected}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
        <button
          onClick={handleTextSend}
          disabled={!isConnected || !textInput.trim()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl text-sm transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
