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
    // A small delay ensures the DOM has rendered the new text before scrolling
    const timeoutId = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Start talking — your conversation will appear here.</p>
      </div>
    );
  }

  return (
    /* pb-80: Adds space at the bottom so messages don't get hidden behind the 
              fixed control box at the bottom-center.
       pt-4: Standard top padding.
    */
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-80 space-y-4">
      {entries.map((entry) => (
        <div
          key={entry.id}
          /* w-full + justify ensures the bubbles align to the correct sides */
          className={`flex w-full ${entry.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            /* max-w-[85%]: Allows the text to stretch wide across the screen.
               leading-relaxed: Makes long paragraphs easier to read.
            */
            className={`max-w-[85%] rounded-2xl px-5 py-3 text-base leading-relaxed shadow-lg ${
              entry.role === "user"
                ? "bg-blue-600 text-white"
                : entry.role === "assistant"
                  ? "bg-gray-800 text-gray-100 border border-gray-700"
                  : "bg-gray-900 text-gray-500 text-xs italic border border-gray-800"
            }`}
          >
            {entry.text}
          </div>
        </div>
      ))}
      {/* Target anchor for the auto-scroll functionality */}
      <div ref={bottomRef} className="h-2" />
    </div>
  );
}