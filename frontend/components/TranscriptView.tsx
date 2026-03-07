import React, { useEffect, useRef } from "react";

export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
}

export default function TranscriptView({ entries }: { entries: TranscriptEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    /* pr-[340px]: This creates a "dead zone" on the right side so messages 
       never slide under the camera/controls box. 
    */
    <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 pr-[340px]">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex w-full ${entry.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-[20px] px-5 py-3 text-base leading-relaxed shadow-sm ${
              entry.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-100 border border-gray-700"
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