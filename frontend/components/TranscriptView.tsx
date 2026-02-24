import React, { useEffect, useRef } from "react";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
}

interface TranscriptViewProps {
  entries: TranscriptEntry[];
}

export default function TranscriptView({ entries }: TranscriptViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Start talking — your conversation will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
              entry.role === "user"
                ? "bg-blue-600 text-white"
                : entry.role === "assistant"
                  ? "bg-gray-700 text-gray-100"
                  : "bg-gray-800 text-gray-400 text-xs italic"
            }`}
          >
            {entry.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
