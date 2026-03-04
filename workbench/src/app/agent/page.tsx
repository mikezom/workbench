"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AgentTaskStatus =
  | "waiting_for_dev"
  | "developing"
  | "waiting_for_review"
  | "finished"
  | "failed"
  | "cancelled";

interface AgentTask {
  id: number;
  title: string;
  prompt: string;
  status: AgentTaskStatus;
  parent_objective: string | null;
  branch_name: string | null;
  worktree_path: string | null;
  error_message: string | null;
  commit_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface AgentTaskOutput {
  id: number;
  task_id: number;
  timestamp: string;
  type: string;
  content: string;
}

interface AgentConfig {
  llm: {
    provider: string;
    model: string;
    api_key: string;
    base_url: string;
  };
}

interface DecomposedTask {
  title: string;
  prompt: string;
}

interface AgentTaskQuestion {
  id: number;
  task_id: number;
  question_id: string;
  question: string;
  options: string[];
  answer: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_COLUMNS: { status: AgentTaskStatus; label: string }[] = [
  { status: "waiting_for_dev", label: "Waiting for Dev" },
  { status: "developing", label: "Developing" },
  { status: "waiting_for_review", label: "Waiting for Review" },
  { status: "finished", label: "Finished" },
  { status: "failed", label: "Failed" },
  { status: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<AgentTaskStatus, string> = {
  waiting_for_dev: "border-l-yellow-500",
  developing: "border-l-blue-500",
  waiting_for_review: "border-l-purple-500",
  finished: "border-l-green-500",
  failed: "border-l-red-500",
  cancelled: "border-l-neutral-400",
};

const STATUS_DOT: Record<AgentTaskStatus, string> = {
  waiting_for_dev: "bg-yellow-500",
  developing: "bg-blue-500",
  waiting_for_review: "bg-purple-500",
  finished: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-neutral-400",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  PromptInput                                                        */
/* ------------------------------------------------------------------ */

function PromptInput({
  onTasksCreated,
}: {
  onTasksCreated: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [decomposing, setDecomposing] = useState(false);
  const [decomposed, setDecomposed] = useState<DecomposedTask[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecompose = async () => {
    if (!prompt.trim()) return;
    setDecomposing(true);
    setError(null);
    setDecomposed(null);
    try {
      const res = await fetch("/api/agent/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Decomposition failed");
        return;
      }
      const data = await res.json();
      setDecomposed(data.tasks);
    } catch {
      setError("Failed to connect to server");
    } finally {
      setDecomposing(false);
    }
  };

  const handleCreateDirect = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: prompt.trim().slice(0, 80), prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create task");
        return;
      }
      setPrompt("");
      onTasksCreated();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDecomposed = async () => {
    if (!decomposed || decomposed.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      for (const task of decomposed) {
        const res = await fetch("/api/agent/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            prompt: task.prompt,
            parent_objective: prompt.trim(),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to create task");
          return;
        }
      }
      setPrompt("");
      setDecomposed(null);
      onTasksCreated();
    } catch {
      setError("Failed to connect to server");
    } finally {
      setCreating(false);
    }
  };

  const handleEditTask = (index: number, field: "title" | "prompt", value: string) => {
    if (!decomposed) return;
    setDecomposed(decomposed.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    ));
  };

  const handleRemoveTask = (index: number) => {
    if (!decomposed) return;
    setDecomposed(decomposed.filter((_, i) => i !== index));
  };

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700 pb-4 mb-4">
      <div className="flex gap-2 items-start">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to build or fix..."
          rows={2}
          className="flex-1 border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) handleDecompose();
          }}
        />
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={handleDecompose}
            disabled={!prompt.trim() || decomposing || creating}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
          >
            {decomposing ? "Decomposing..." : "Decompose"}
          </button>
          <button
            onClick={handleCreateDirect}
            disabled={!prompt.trim() || decomposing || creating}
            className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating && !decomposed ? "Creating..." : "Direct"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 p-2 text-sm bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Decomposed tasks preview */}
      {decomposed && decomposed.length > 0 && (
        <div className="mt-3 border border-neutral-300 dark:border-neutral-600 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {decomposed.length} sub-task{decomposed.length !== 1 ? "s" : ""} — review and confirm:
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDecomposed(null)}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDecomposed}
                disabled={creating || decomposed.length === 0}
                className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                {creating ? "Creating..." : "Confirm All"}
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {decomposed.map((task, i) => (
              <div key={i} className="flex gap-2 items-start border border-neutral-200 dark:border-neutral-700 rounded p-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={task.title}
                    onChange={(e) => handleEditTask(i, "title", e.target.value)}
                    className="w-full border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-sm bg-white dark:bg-neutral-800"
                  />
                  <textarea
                    value={task.prompt}
                    onChange={(e) => handleEditTask(i, "prompt", e.target.value)}
                    rows={2}
                    className="w-full border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800 resize-none"
                  />
                </div>
                <button
                  onClick={() => handleRemoveTask(i)}
                  className="text-red-500 hover:text-red-700 text-sm shrink-0 px-1"
                  title="Remove task"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TaskCard                                                           */
/* ------------------------------------------------------------------ */

function TaskCard({
  task,
  onSelect,
}: {
  task: AgentTask;
  onSelect: (task: AgentTask) => void;
}) {
  return (
    <div
      className={`border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800/50 p-2.5 border-l-4 ${STATUS_COLORS[task.status]}`}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium truncate flex-1 min-w-0">{task.title}</p>
        <button
          onClick={() => onSelect(task)}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0 text-base leading-none"
          title="View details"
        >
          &#x2922;
        </button>
      </div>
      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
        {timeAgo(task.created_at)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TaskBoard                                                          */
/* ------------------------------------------------------------------ */

function TaskBoard({
  tasks,
  onSelectTask,
}: {
  tasks: AgentTask[];
  onSelectTask: (task: AgentTask) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
      {STATUS_COLUMNS.map(({ status, label }) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col min-h-[120px]"
          >
            <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {label}
              </span>
              {columnTasks.length > 0 && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  ({columnTasks.length})
                </span>
              )}
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto">
              {columnTasks.map((task) => (
                <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
              ))}
              {columnTasks.length === 0 && (
                <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
                  No tasks
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TaskDetailModal                                                    */
/* ------------------------------------------------------------------ */

function TaskDetailModal({
  task,
  onClose,
  onTaskUpdated,
}: {
  task: AgentTask;
  onClose: () => void;
  onTaskUpdated: () => void;
}) {
  const [output, setOutput] = useState<AgentTaskOutput[]>([]);
  const [loadingOutput, setLoadingOutput] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentTask, setCurrentTask] = useState(task);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [questions, setQuestions] = useState<AgentTaskQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState(false);

  // Fetch task output
  const fetchOutput = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/output?limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      setOutput(data);
    } catch {
      // ignore
    } finally {
      setLoadingOutput(false);
    }
  }, [task.id]);

  // Fetch task status
  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentTask(data);
      // Stop polling if task is no longer active
      if (data.status !== "developing" && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      // ignore
    }
  }, [task.id]);

  // Fetch questions for waiting_for_review tasks
  const fetchQuestions = useCallback(async () => {
    if (currentTask.status !== "waiting_for_review") return;
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/questions`);
      if (!res.ok) return;
      const data: AgentTaskQuestion[] = await res.json();
      setQuestions(data);
      // Pre-fill already answered questions
      const existing: Record<string, string> = {};
      for (const q of data) {
        if (q.answer) existing[q.question_id] = q.answer;
      }
      if (Object.keys(existing).length > 0) {
        setSelectedAnswers((prev) => ({ ...existing, ...prev }));
      }
    } catch {
      // ignore
    }
  }, [task.id, currentTask.status]);

  // Initial load + polling for active tasks
  useEffect(() => {
    fetchOutput();
    fetchTask();
    fetchQuestions();

    if (task.status === "developing" || task.status === "waiting_for_review") {
      pollRef.current = setInterval(() => {
        fetchOutput();
        fetchTask();
        fetchQuestions();
      }, 3000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchOutput, fetchTask, fetchQuestions, task.status]);

  // Auto-scroll to bottom when output updates
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/agent/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      setCurrentTask((prev) => ({ ...prev, status: "cancelled" }));
      onTaskUpdated();
    } catch {
      // ignore
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete task "${currentTask.title}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/agent/tasks/${task.id}`, { method: "DELETE" });
      onTaskUpdated();
      onClose();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmitAnswers = async () => {
    const unanswered = questions.filter((q) => !q.answer && !selectedAnswers[q.question_id]);
    if (unanswered.length > 0) return;

    setSubmittingAnswers(true);
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: selectedAnswers }),
      });
      if (res.ok) {
        fetchQuestions();
        onTaskUpdated();
      }
    } catch {
      // ignore
    } finally {
      setSubmittingAnswers(false);
    }
  };

  const outputTypeColor: Record<string, string> = {
    stdout: "text-neutral-300 dark:text-neutral-400",
    stderr: "text-red-400 dark:text-red-400",
    system: "text-blue-400 dark:text-blue-400",
    assistant: "text-green-400 dark:text-green-400",
    tool: "text-purple-400 dark:text-purple-400",
  };

  const canCancel = currentTask.status === "waiting_for_dev" || currentTask.status === "developing";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex-1 min-w-0 mr-4">
            <h2 className="text-lg font-semibold truncate">{currentTask.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[currentTask.status]}`} />
              <span className="text-xs text-neutral-500">{currentTask.status.replace(/_/g, " ")}</span>
              <span className="text-xs text-neutral-400">#{currentTask.id}</span>
              <span className="text-xs text-neutral-400">{timeAgo(currentTask.created_at)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Prompt */}
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">Prompt</p>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{currentTask.prompt}</p>
          {currentTask.parent_objective && (
            <p className="text-xs text-neutral-400 mt-2">
              Parent: {currentTask.parent_objective.slice(0, 100)}{currentTask.parent_objective.length > 100 ? "..." : ""}
            </p>
          )}
        </div>

        {/* Error message */}
        {currentTask.error_message && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">{currentTask.error_message}</p>
          </div>
        )}

        {/* Clarification Questions */}
        {currentTask.status === "waiting_for_review" && questions.length > 0 && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-purple-50 dark:bg-purple-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">
              Clarification Questions
            </p>
            <div className="space-y-4">
              {questions.filter((q) => !q.answer).map((q) => (
                <div key={q.question_id}>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                    {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((option) => (
                      <label
                        key={option}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${
                          selectedAnswers[q.question_id] === option
                            ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                            : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.question_id}
                          value={option}
                          checked={selectedAnswers[q.question_id] === option}
                          onChange={() =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [q.question_id]: option,
                            }))
                          }
                          className="accent-purple-600"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {questions.some((q) => q.answer) && (
                <div className="border-t border-purple-200 dark:border-purple-800 pt-3">
                  <p className="text-xs text-purple-500 dark:text-purple-400 mb-2">Previously answered:</p>
                  {questions.filter((q) => q.answer).map((q) => (
                    <div key={q.question_id} className="text-xs text-neutral-500 mb-1">
                      <span className="font-medium">{q.question}</span> — {q.answer}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {questions.some((q) => !q.answer) && (
              <button
                onClick={handleSubmitAnswers}
                disabled={
                  submittingAnswers ||
                  questions.filter((q) => !q.answer).some((q) => !selectedAnswers[q.question_id])
                }
                className="mt-3 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
              >
                {submittingAnswers ? "Submitting..." : "Submit Answers"}
              </button>
            )}
          </div>
        )}

        {/* Output */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-neutral-950 font-mono text-xs min-h-[200px]">
          {loadingOutput ? (
            <p className="text-neutral-500">Loading output...</p>
          ) : output.length === 0 ? (
            <p className="text-neutral-600">
              {currentTask.status === "waiting_for_dev"
                ? "Waiting for daemon to pick up this task..."
                : currentTask.status === "developing"
                ? "Waiting for output..."
                : "No output recorded."}
            </p>
          ) : (
            output.map((line) => (
              <div key={line.id} className="py-0.5">
                <span className="text-neutral-600 select-none">
                  {new Date(line.timestamp + "Z").toLocaleTimeString()}{" "}
                </span>
                <span className={`text-neutral-500 select-none ${outputTypeColor[line.type] || ""}`}>
                  [{line.type}]{" "}
                </span>
                <span className="text-neutral-200 whitespace-pre-wrap break-all">{line.content}</span>
              </div>
            ))
          )}
          <div ref={outputEndRef} />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between p-4 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex gap-2">
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel Task"}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting || currentTask.status === "developing"}
              className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 border border-red-300 dark:border-red-700 rounded disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
          <div className="text-xs text-neutral-400 space-x-3">
            {currentTask.branch_name && <span>Branch: {currentTask.branch_name}</span>}
            {currentTask.commit_id && <span>Commit: {currentTask.commit_id.slice(0, 7)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ConfigPanel                                                        */
/* ------------------------------------------------------------------ */

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form fields
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agent/config");
        if (!res.ok) return;
        const data: AgentConfig = await res.json();
        setConfig(data);
        setProvider(data.llm.provider);
        setModel(data.llm.model);
        setApiKey(""); // Don't prefill masked key
        setBaseUrl(data.llm.base_url);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const update: Record<string, unknown> = {};
      const llm: Record<string, string> = {};
      if (provider !== config?.llm.provider) llm.provider = provider;
      if (model !== config?.llm.model) llm.model = model;
      if (apiKey) llm.api_key = apiKey; // Only send if user typed a new key
      if (baseUrl !== config?.llm.base_url) llm.base_url = baseUrl;
      if (Object.keys(llm).length > 0) update.llm = llm;

      if (Object.keys(update).length > 0) {
        const res = await fetch("/api/agent/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold">Agent Config</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <p className="text-neutral-500 text-sm">Loading...</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="other">Other (OpenAI-compatible)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                  placeholder="e.g., claude-sonnet-4-20250514"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                  placeholder={config?.llm.api_key ? `Current: ${config.llm.api_key}` : "Enter API key"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                  placeholder="https://api.anthropic.com"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-neutral-200 dark:border-neutral-700">
          <div>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main AgentPage                                                     */
/* ------------------------------------------------------------------ */

export default function AgentPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/tasks");
      if (!res.ok) return;
      const data = await res.json();
      setTasks(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchTasks();
    pollRef.current = setInterval(fetchTasks, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTasks]);

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Agent</h1>
        <button
          onClick={() => setShowConfig(true)}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1"
        >
          Config
        </button>
      </div>

      {/* Prompt input */}
      <PromptInput onTasksCreated={fetchTasks} />

      {/* Task board */}
      {loading ? (
        <p className="text-neutral-500 text-sm">Loading tasks...</p>
      ) : (
        <TaskBoard tasks={tasks} onSelectTask={setSelectedTask} />
      )}

      {/* Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={fetchTasks}
        />
      )}
      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}
    </div>
  );
}
