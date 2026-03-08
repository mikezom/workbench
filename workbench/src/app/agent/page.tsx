"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

interface AvailableSkill {
  name: string;
  path: string;
}

type Tab = "persona" | "memory" | "skills" | "tools";

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
/*  FileEditor — reusable textarea editor for persona/memory/tools     */
/* ------------------------------------------------------------------ */

function FileEditor({
  agentId,
  endpoint,
  label,
  validateJson,
}: {
  agentId: number;
  endpoint: string;
  label: string;
  validateJson?: boolean;
}) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = content !== savedContent;

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/${endpoint}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setContent(data.content ?? "");
      setSavedContent(data.content ?? "");
    } catch {
      setError("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [agentId, endpoint]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleSave = async () => {
    if (validateJson) {
      try {
        JSON.parse(content);
      } catch {
        setError("Invalid JSON");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/${endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      setSavedContent(content);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-neutral-500 dark:text-neutral-400 p-4">Loading {label}...</p>;
  }

  return (
    <div className="flex flex-col h-full">
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setError(null);
        }}
        className="flex-1 w-full border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
        placeholder={`Enter ${label} content...`}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
      )}
      {isDirty && (
        <div className="mt-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save ${label}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SkillsTab                                                          */
/* ------------------------------------------------------------------ */

function SkillsTab({ agentId }: { agentId: number }) {
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string>("");
  const [skillSavedContent, setSkillSavedContent] = useState<string>("");
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/skills`);
      if (!res.ok) return;
      const data = await res.json();
      setSkills(data.skills ?? []);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    setLoading(true);
    setExpandedSkill(null);
    setShowPicker(false);
    fetchSkills();
  }, [fetchSkills]);

  const loadSkillContent = async (name: string) => {
    setSkillLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSkillContent(data.content ?? "");
      setSkillSavedContent(data.content ?? "");
    } finally {
      setSkillLoading(false);
    }
  };

  const handleExpand = (name: string) => {
    if (expandedSkill === name) {
      setExpandedSkill(null);
    } else {
      setExpandedSkill(name);
      loadSkillContent(name);
    }
  };

  const handleSaveSkill = async (name: string) => {
    setSkillSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: skillContent }),
      });
      setSkillSavedContent(skillContent);
    } finally {
      setSkillSaving(false);
    }
  };

  const handleRemoveSkill = async (name: string) => {
    if (!confirm(`Remove skill "${name}"?`)) return;
    await fetch(`/api/agents/${agentId}/skills/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (expandedSkill === name) setExpandedSkill(null);
    await fetchSkills();
  };

  const openPicker = async () => {
    setShowPicker(true);
    setPickerLoading(true);
    try {
      const res = await fetch("/api/agents/available-skills");
      if (!res.ok) return;
      const data = await res.json();
      setAvailableSkills(data.skills ?? []);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAddSkill = async (skill: AvailableSkill) => {
    // sourcePath is the parent directory of the skill
    const sourcePath = skill.path.replace(new RegExp(`/${skill.name}$`), "");
    await fetch(`/api/agents/${agentId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillName: skill.name, sourcePath }),
    });
    setShowPicker(false);
    await fetchSkills();
  };

  if (loading) {
    return <p className="text-neutral-500 dark:text-neutral-400">Loading skills...</p>;
  }

  const filteredAvailable = availableSkills.filter(
    (s) => !skills.includes(s.name)
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={openPicker}
          className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
        >
          + Add Skill
        </button>
      </div>

      {/* Skill picker */}
      {showPicker && (
        <div className="border border-neutral-300 dark:border-neutral-600 rounded p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Available Skills
            </h3>
            <button
              onClick={() => setShowPicker(false)}
              className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Close
            </button>
          </div>
          {pickerLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
          ) : filteredAvailable.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No additional skills available
            </p>
          ) : (
            <div className="space-y-1">
              {filteredAvailable.map((skill) => (
                <button
                  key={skill.name}
                  onClick={() => handleAddSkill(skill)}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                >
                  {skill.name}
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {skill.path}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skill list */}
      {skills.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No skills added yet
        </p>
      )}

      <div className="space-y-2">
        {skills.map((name) => (
          <div
            key={name}
            className="border border-neutral-200 dark:border-neutral-700 rounded"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => handleExpand(name)}
                className="flex-1 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100"
              >
                <span className="mr-2 text-neutral-400">
                  {expandedSkill === name ? "\u25BC" : "\u25B6"}
                </span>
                {name}
              </button>
              <button
                onClick={() => handleRemoveSkill(name)}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 ml-3"
              >
                Remove
              </button>
            </div>

            {expandedSkill === name && (
              <div className="px-4 pb-4">
                {skillLoading ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
                ) : (
                  <>
                    <textarea
                      value={skillContent}
                      onChange={(e) => setSkillContent(e.target.value)}
                      rows={12}
                      className="w-full border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                    />
                    {skillContent !== skillSavedContent && (
                      <div className="mt-2">
                        <button
                          onClick={() => handleSaveSkill(name)}
                          disabled={skillSaving}
                          className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
                        >
                          {skillSaving ? "Saving..." : "Save Skill"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AgentDetail (Right Panel)                                          */
/* ------------------------------------------------------------------ */

function AgentDetail({
  agent,
  onUpdate,
  onDelete,
}: {
  agent: Agent;
  onUpdate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("persona");
  const [editName, setEditName] = useState(agent.name);
  const [editDesc, setEditDesc] = useState(agent.description ?? "");
  const [saving, setSaving] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const prevAgentId = useRef(agent.id);

  // Reset form when agent changes
  useEffect(() => {
    if (prevAgentId.current !== agent.id) {
      setTab("persona");
      prevAgentId.current = agent.id;
    }
    setEditName(agent.name);
    setEditDesc(agent.description ?? "");
    setHeaderError(null);
  }, [agent]);

  const headerDirty =
    editName !== agent.name || editDesc !== (agent.description ?? "");

  const handleSaveHeader = async () => {
    if (!editName.trim() || !NAME_RE.test(editName)) {
      setHeaderError("Name must be alphanumeric, hyphens, underscores only");
      return;
    }
    setSaving(true);
    setHeaderError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setHeaderError(data.error || "Failed to save");
        return;
      }
      await onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    await onDelete();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "persona", label: "Persona" },
    { key: "memory", label: "Memory" },
    { key: "skills", label: "Skills" },
    { key: "tools", label: "Tools" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header: name, description, save, delete */}
      <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                setHeaderError(null);
              }}
              className="text-lg font-bold bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-neutral-400 dark:focus:border-neutral-500 text-neutral-900 dark:text-neutral-100 focus:outline-none w-full"
            />
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Add a description..."
              className="text-sm bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-neutral-400 dark:focus:border-neutral-500 text-neutral-500 dark:text-neutral-400 focus:outline-none w-full"
            />
            {headerError && (
              <p className="text-xs text-red-600 dark:text-red-400">{headerError}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0 pt-1">
            {headerDirty && (
              <button
                onClick={handleSaveHeader}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-4 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 rounded border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-6 mt-4 border-b border-neutral-200 dark:border-neutral-700 -mb-[1px]">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                  : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === "persona" && (
          <FileEditor
            key={`persona-${agent.id}`}
            agentId={agent.id}
            endpoint="persona"
            label="Persona"
          />
        )}
        {tab === "memory" && (
          <FileEditor
            key={`memory-${agent.id}`}
            agentId={agent.id}
            endpoint="memory"
            label="Memory"
          />
        )}
        {tab === "skills" && (
          <SkillsTab key={`skills-${agent.id}`} agentId={agent.id} />
        )}
        {tab === "tools" && (
          <FileEditor
            key={`tools-${agent.id}`}
            agentId={agent.id}
            endpoint="tools"
            label="Tools"
            validateJson
          />
        )}
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

  const handleDelete = async () => {
    setSelectedId(null);
    await fetchAgents();
  };

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
      <div className="flex-1 flex flex-col min-w-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
          </div>
        ) : selectedAgent ? (
          <AgentDetail
            key={selectedAgent.id}
            agent={selectedAgent}
            onUpdate={fetchAgents}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-neutral-500 dark:text-neutral-400">
              Select an agent to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
