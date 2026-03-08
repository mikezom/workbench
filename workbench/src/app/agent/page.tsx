"use client";

import { useState, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Agent {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

/* ------------------------------------------------------------------ */
/*  AgentList (Left Panel)                                             */
/* ------------------------------------------------------------------ */

function AgentList({
  agents,
  selectedId,
  onSelect,
  onCreated,
}: {
  agents: Agent[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreated: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = newName.trim() !== "" && NAME_RE.test(newName);

  const handleCreate = async () => {
    if (!nameValid) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create agent");
        return;
      }
      setNewName("");
      setNewDesc("");
      setShowForm(false);
      await onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-700 flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Agents</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setError(null);
          }}
          className="px-3 py-1.5 text-xs bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
        >
          + New Agent
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 space-y-2">
          <input
            type="text"
            placeholder="Agent name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          {newName && !nameValid && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Only alphanumeric, hyphens, underscores allowed
            </p>
          )}
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
          />
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !nameValid}
              className="px-3 py-1.5 text-xs bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setNewName("");
                setNewDesc("");
                setError(null);
              }}
              className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scrollable agent list */}
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 && (
          <p className="px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400 text-center">
            No agents yet
          </p>
        )}
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 transition-colors ${
              selectedId === agent.id
                ? "bg-neutral-100 dark:bg-neutral-800"
                : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            }`}
          >
            <span className="block font-medium text-sm text-neutral-900 dark:text-neutral-100">
              {agent.name}
            </span>
            {agent.description && (
              <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {agent.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main AgentPage                                                     */
/* ------------------------------------------------------------------ */

export default function AgentPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      setAgents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Left Panel */}
      <AgentList
        agents={agents}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreated={fetchAgents}
      />

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
        ) : selectedAgent ? (
          <p className="text-neutral-500 dark:text-neutral-400">
            Agent detail panel coming soon
          </p>
        ) : (
          <p className="text-neutral-500 dark:text-neutral-400">
            Select an agent to view details
          </p>
        )}
      </div>
    </div>
  );
}
