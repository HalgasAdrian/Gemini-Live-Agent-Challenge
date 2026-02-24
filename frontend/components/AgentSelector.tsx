import React, { useEffect, useState } from "react";
import { BACKEND_API_URL } from "@/lib/constants";

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  voice: string;
}

interface AgentSelectorProps {
  onStart: (presetId: string) => void;
}

export default function AgentSelector({ onStart }: AgentSelectorProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState("general");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_API_URL}/api/agents`)
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch agents:", err);
        // Fallback
        setAgents([{ id: "general", name: "General Assistant", description: "A friendly voice assistant.", voice: "Kore" }]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md w-full mx-4 space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gemini Live Agent</h1>
          <p className="text-gray-400">Choose an agent and start talking.</p>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading agents...</p>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelected(agent.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  selected === agent.id
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500"
                }`}
              >
                <div className="font-medium">{agent.name}</div>
                <div className="text-sm text-gray-400 mt-0.5">{agent.description}</div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onStart(selected)}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-lg transition-colors"
        >
          Start Session
        </button>
      </div>
    </div>
  );
}
