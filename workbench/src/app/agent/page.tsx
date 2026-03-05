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
  | "cancelled"
  | "decompose_understanding"
  | "decompose_waiting_for_answers"
  | "decompose_breaking_down"
  | "decompose_waiting_for_approval"
  | "decompose_approved"
  | "decompose_waiting_for_completion"
  | "decompose_reflecting"
  | "decompose_complete";

type AgentTaskType = "worker" | "decompose";

interface AgentTask {
  id: number;
  title: string;
  prompt: string;
  status: AgentTaskStatus;
  parent_objective: string | null;
  parent_task_id: number | null;
  task_type: AgentTaskType;
  branch_name: string | null;
  worktree_path: string | null;
  error_message: string | null;
  commit_id: string | null;
  decompose_breakdown: string | null;
  decompose_user_comment: string | null;
  user_task_comment: string | null;
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

const STATUS_COLUMNS: {
  status: AgentTaskStatus;
  label: string;
  includeStatuses: AgentTaskStatus[];
}[] = [
  {
    status: "waiting_for_dev",
    label: "Waiting for Dev",
    includeStatuses: ["waiting_for_dev", "decompose_approved", "decompose_waiting_for_completion"]
  },
  {
    status: "developing",
    label: "Developing",
    includeStatuses: ["developing", "decompose_understanding", "decompose_breaking_down", "decompose_reflecting"]
  },
  {
    status: "waiting_for_review",
    label: "Waiting for Review",
    includeStatuses: ["waiting_for_review", "decompose_waiting_for_answers", "decompose_waiting_for_approval"]
  },
  {
    status: "finished",
    label: "Finished",
    includeStatuses: ["finished", "decompose_complete"]
  },
  {
    status: "failed",
    label: "Failed",
    includeStatuses: ["failed"]
  },
  {
    status: "cancelled",
    label: "Cancelled",
    includeStatuses: ["cancelled"]
  },
];

const STATUS_COLORS: Record<AgentTaskStatus, string> = {
  waiting_for_dev: "border-l-yellow-500",
  developing: "border-l-blue-500",
  waiting_for_review: "border-l-purple-500",
  finished: "border-l-green-500",
  failed: "border-l-red-500",
  cancelled: "border-l-neutral-400",
  decompose_understanding: "border-l-purple-400",
  decompose_waiting_for_answers: "border-l-purple-500",
  decompose_breaking_down: "border-l-purple-400",
  decompose_waiting_for_approval: "border-l-purple-600",
  decompose_approved: "border-l-blue-400",
  decompose_waiting_for_completion: "border-l-blue-500",
  decompose_reflecting: "border-l-indigo-500",
  decompose_complete: "border-l-green-600",
};

const STATUS_DOT: Record<AgentTaskStatus, string> = {
  waiting_for_dev: "bg-yellow-500",
  developing: "bg-blue-500",
  waiting_for_review: "bg-purple-500",
  finished: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-neutral-400",
  decompose_understanding: "bg-purple-400",
  decompose_waiting_for_answers: "bg-purple-500",
  decompose_breaking_down: "bg-purple-400",
  decompose_waiting_for_approval: "bg-purple-600",
  decompose_approved: "bg-blue-400",
  decompose_waiting_for_completion: "bg-blue-500",
  decompose_reflecting: "bg-indigo-500",
  decompose_complete: "bg-green-600",
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecompose = async () => {
    if (!prompt.trim()) return;
    setDecomposing(true);
    setError(null);
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
      // Decompose task created - clear prompt and refresh
      setPrompt("");
      onTasksCreated();
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

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-700 pb-4 mb-4">
      <div className="flex gap-2 items-stretch">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to build or fix..."
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
            {creating ? "Creating..." : "Direct"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 p-2 text-sm bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
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
      {STATUS_COLUMNS.map(({ status, label, includeStatuses }) => {
        const columnTasks = tasks.filter((t) => includeStatuses.includes(t.status));
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

const ACTIVE_STATUSES: AgentTaskStatus[] = [
  "developing",
  "waiting_for_review",
  "decompose_understanding",
  "decompose_breaking_down",
  "decompose_waiting_for_answers",
  "decompose_waiting_for_approval",
  "decompose_waiting_for_completion",
  "decompose_reflecting",
];

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
  // Worker questions
  const [questions, setQuestions] = useState<AgentTaskQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
  // Decompose state
  const [decomposeQuestions, setDecomposeQuestions] = useState<Array<{ id: string; question: string; options: string[]; answer: string | null }>>([]);
  const [decomposeAnswers, setDecomposeAnswers] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<Array<{ title: string; prompt: string }> | null>(null);
  const [subTasks, setSubTasks] = useState<AgentTask[]>([]);
  const [rejectComment, setRejectComment] = useState("");
  const [decomposeError, setDecomposeError] = useState<string | null>(null);

  const isDecompose = currentTask.task_type === "decompose";

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
      if (!ACTIVE_STATUSES.includes(data.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      // ignore
    }
  }, [task.id]);

  // Fetch questions for waiting_for_review worker tasks
  const fetchQuestions = useCallback(async () => {
    if (currentTask.status !== "waiting_for_review") return;
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/questions`);
      if (!res.ok) return;
      const data: AgentTaskQuestion[] = await res.json();
      setQuestions(data);
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

  // Fetch decompose details (questions + breakdown)
  const fetchDecomposeDetails = useCallback(async () => {
    if (!isDecompose) return;
    if (currentTask.status !== "decompose_waiting_for_answers" && currentTask.status !== "decompose_waiting_for_approval") return;
    try {
      const res = await fetch(`/api/agent/decompose/${task.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setDecomposeQuestions(data.questions || []);
      setBreakdown(data.breakdown || null);
      const initialAnswers: Record<string, string> = {};
      data.questions?.forEach((q: { id: string; answer: string | null }) => {
        if (q.answer) initialAnswers[q.id] = q.answer;
      });
      setDecomposeAnswers((prev) => ({ ...initialAnswers, ...prev }));
    } catch {
      // ignore
    }
  }, [task.id, isDecompose, currentTask.status]);

  // Fetch sub-tasks for decompose tasks
  const fetchSubTasks = useCallback(async () => {
    if (!isDecompose) return;
    if (currentTask.status !== "decompose_waiting_for_completion" && currentTask.status !== "decompose_reflecting") return;
    try {
      const res = await fetch(`/api/agent/decompose/${task.id}/subtasks`);
      if (!res.ok) return;
      const data = await res.json();
      setSubTasks(data.sub_tasks || []);
    } catch {
      // ignore
    }
  }, [task.id, isDecompose, currentTask.status]);

  // Initial load + polling
  useEffect(() => {
    fetchOutput();
    fetchTask();
    fetchQuestions();
    fetchDecomposeDetails();
    fetchSubTasks();

    if (ACTIVE_STATUSES.includes(task.status)) {
      pollRef.current = setInterval(() => {
        fetchOutput();
        fetchTask();
        fetchQuestions();
        fetchDecomposeDetails();
        fetchSubTasks();
      }, 3000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchOutput, fetchTask, fetchQuestions, fetchDecomposeDetails, fetchSubTasks, task.status]);

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

  // Worker question submission
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

  // Decompose question submission
  const handleSubmitDecomposeAnswers = async () => {
    setSubmittingAnswers(true);
    setDecomposeError(null);
    try {
      const res = await fetch(`/api/agent/decompose/${task.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: decomposeAnswers }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDecomposeError(data.error || "Failed to submit answers");
        return;
      }
      onTaskUpdated();
    } catch {
      setDecomposeError("Failed to connect to server");
    } finally {
      setSubmittingAnswers(false);
    }
  };

  // Breakdown approval
  const handleApproveBreakdown = async () => {
    setSubmittingAnswers(true);
    setDecomposeError(null);
    try {
      const res = await fetch(`/api/agent/decompose/${task.id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setDecomposeError(data.error || "Failed to approve breakdown");
        return;
      }
      onTaskUpdated();
    } catch {
      setDecomposeError("Failed to connect to server");
    } finally {
      setSubmittingAnswers(false);
    }
  };

  // Breakdown rejection
  const handleRejectBreakdown = async () => {
    if (!rejectComment.trim()) {
      setDecomposeError("Please provide feedback on what needs to change");
      return;
    }
    setSubmittingAnswers(true);
    setDecomposeError(null);
    try {
      const res = await fetch(`/api/agent/decompose/${task.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: rejectComment.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDecomposeError(data.error || "Failed to reject breakdown");
        return;
      }
      setRejectComment("");
      onTaskUpdated();
    } catch {
      setDecomposeError("Failed to connect to server");
    } finally {
      setSubmittingAnswers(false);
    }
  };

  // Sub-task commenting
  const handleCommentSubTask = async (taskId: number, taskComment: string) => {
    try {
      const res = await fetch(`/api/agent/tasks/${taskId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: taskComment }),
      });
      if (res.ok) fetchSubTasks();
    } catch {
      // ignore
    }
  };

  const outputTypeColor: Record<string, string> = {
    stdout: "text-neutral-300 dark:text-neutral-400",
    stderr: "text-red-400 dark:text-red-400",
    system: "text-blue-400 dark:text-blue-400",
    assistant: "text-green-400 dark:text-green-400",
    tool: "text-purple-400 dark:text-purple-400",
  };

  const canCancel =
    currentTask.status === "waiting_for_dev" ||
    currentTask.status === "developing" ||
    currentTask.status === "decompose_understanding" ||
    currentTask.status === "decompose_breaking_down";

  const allDecomposeQuestionsAnswered = decomposeQuestions.length > 0 && decomposeQuestions.every((q) => decomposeAnswers[q.id]);

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
              {isDecompose && (
                <span className="text-xs text-purple-500 dark:text-purple-400 font-medium">decompose</span>
              )}
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

        {/* Decompose error */}
        {decomposeError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">{decomposeError}</p>
          </div>
        )}

        {/* Worker Clarification Questions */}
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

        {/* Decompose Questions Phase */}
        {currentTask.status === "decompose_waiting_for_answers" && decomposeQuestions.length > 0 && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-purple-50 dark:bg-purple-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">
              Clarification Questions
            </p>
            {decomposeQuestions.every((q) => q.answer) ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                All questions answered — waiting for agent to process...
              </p>
            ) : (
              <>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {decomposeQuestions.filter((q) => !q.answer).map((q) => (
                    <div key={q.id} className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
                      <p className="text-sm font-medium mb-2">{q.question}</p>
                      <div className="space-y-1.5">
                        {q.options.map((option) => (
                          <label
                            key={option}
                            className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${
                              decomposeAnswers[q.id] === option
                                ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                                : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`decompose-${q.id}`}
                              value={option}
                              checked={decomposeAnswers[q.id] === option}
                              onChange={() => setDecomposeAnswers((prev) => ({ ...prev, [q.id]: option }))}
                              className="accent-purple-600"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSubmitDecomposeAnswers}
                  disabled={!allDecomposeQuestionsAnswered || submittingAnswers}
                  className="mt-3 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
                >
                  {submittingAnswers ? "Submitting..." : "Submit Answers"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Decompose Breakdown Approval Phase */}
        {currentTask.status === "decompose_waiting_for_approval" && breakdown && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-purple-50 dark:bg-purple-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">
              Proposed Breakdown ({breakdown.length} tasks)
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {breakdown.map((subTask, i) => (
                <div key={i} className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
                  <p className="font-medium text-sm">{i + 1}. {subTask.title}</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    {subTask.prompt.slice(0, 200)}{subTask.prompt.length > 200 ? "..." : ""}
                  </p>
                </div>
              ))}
            </div>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Optional: Provide feedback if rejecting..."
              rows={2}
              className="mt-3 w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleRejectBreakdown}
                disabled={submittingAnswers}
                className="flex-1 px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {submittingAnswers ? "Rejecting..." : "Reject & Revise"}
              </button>
              <button
                onClick={handleApproveBreakdown}
                disabled={submittingAnswers}
                className="flex-1 px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                {submittingAnswers ? "Approving..." : "Approve & Create Tasks"}
              </button>
            </div>
          </div>
        )}

        {/* Decompose Sub-tasks Progress */}
        {(currentTask.status === "decompose_waiting_for_completion" || currentTask.status === "decompose_reflecting") && subTasks.length > 0 && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-purple-50 dark:bg-purple-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">
              Sub-tasks Progress
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {subTasks.map((st) => (
                <div key={st.id} className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{st.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${STATUS_DOT[st.status]}`} />
                        {st.status.replace(/_/g, " ")}
                      </p>
                    </div>
                    {(st.status === "finished" || st.status === "failed") && !st.user_task_comment && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleCommentSubTask(st.id, "Good")}
                          className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                        >
                          Good
                        </button>
                        <button
                          onClick={() => {
                            const feedback = prompt("What went wrong?");
                            if (feedback) handleCommentSubTask(st.id, feedback);
                          }}
                          className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          Issue
                        </button>
                      </div>
                    )}
                    {st.user_task_comment && (
                      <span className="text-xs text-green-600 shrink-0">&#x2713; Commented</span>
                    )}
                  </div>
                  {st.user_task_comment && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 italic">
                      Comment: {st.user_task_comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {currentTask.status === "decompose_reflecting" && (
              <p className="text-sm text-purple-600 dark:text-purple-400 mt-2">
                Reflecting on results...
              </p>
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
          <h2 className="text-lg font-semibold">Agent Config (Deprecated)</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Deprecation Notice */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3 text-sm">
            <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">⚠️ Deprecated</p>
            <p className="text-yellow-700 dark:text-yellow-300">
              This config is no longer used. Both working and decompose agents use Claude Code CLI directly,
              which handles authentication via your local Claude CLI configuration.
            </p>
            <p className="text-yellow-700 dark:text-yellow-300 mt-2">
              Configure your Claude CLI with: <code className="bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">claude auth login</code>
            </p>
          </div>

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
    <div className="flex flex-col h-full p-4 overflow-hidden bg-white dark:bg-neutral-900">
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
