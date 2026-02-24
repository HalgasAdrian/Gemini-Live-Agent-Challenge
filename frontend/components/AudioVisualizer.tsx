import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isActive: boolean;
}

/**
 * Simple animated bars visualizer. Shows activity when mic is live.
 */
export default function AudioVisualizer({ isActive }: AudioVisualizerProps) {
  return (
    <div className="flex items-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-150 ${
            isActive ? "bg-blue-400 animate-pulse" : "bg-gray-600"
          }`}
          style={{
            height: isActive ? `${12 + Math.random() * 20}px` : "8px",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
