"use client";

import { useState, useEffect, useCallback } from "react";
import PageContainer from "@/components/page-container";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActiveAgent {
  task_id: number;
  title: string;
  status: string;
  task_type: string;
  started_at: string | null;
  prompt: string;
  process_id: number | null;
  subprocess_pids: string | null;
  current_phase: string | null;
  current_file: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  monitor_started_at: string | null;
  last_updated: string | null;
}

interface QueueTask {
  id: number;
  title: string;
  status: string;
  task_type: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  parent_task_id: number | null;
}

interface ReportSummary {
  task_id: number;
  title: string;
  status: string;
  created_at: string;
}

interface FullReport {
  task_id: number;
  title: string;
  prompt: string;
  status: string;
  report_markdown: string;
  created_at: string;
  task_created_at: string;
}

type Tab = "active" | "queue" | "reports" | "agent";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function TypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  let label = type;
  let cls = "bg-blue-600/20 text-blue-400";
  if (t === "worker" || t === "development") {
    label = "Dev";
    cls = "bg-blue-600/20 text-blue-400";
  } else if (t === "investigation") {
    label = "Inv";
    cls = "bg-purple-600/20 text-purple-400";
  } else if (t === "decompose") {
    label = "Dec";
    cls = "bg-orange-600/20 text-orange-400";
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let label = status;
  let cls = "bg-neutral-600/20 text-neutral-400";

  if (s === "waiting_for_dev" || s === "decompose_understanding" || s === "decompose_approved") {
    label = "Queued";
    cls = "bg-yellow-600/20 text-yellow-400";
  } else if (s === "developing" || s === "decompose_breaking_down" || s === "decompose_reflecting" ||
             s === "waiting_for_review" || s === "decompose_waiting_for_answers" ||
             s === "decompose_waiting_for_approval" || s === "decompose_waiting_for_completion") {
    label = "In Progress";
    cls = "bg-blue-600/20 text-blue-400";
  } else if (s === "finished" || s === "decompose_complete") {
    label = "Completed";
    cls = "bg-green-600/20 text-green-400";
  } else if (s === "failed" || s === "cancelled") {
    label = s === "failed" ? "Failed" : "Cancelled";
    cls = "bg-red-600/20 text-red-400";
  }

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ------------------------------------------------------------------ */
/*  Tab 1: Active Agents                                               */
/* ------------------------------------------------------------------ */

function ActiveAgentsTab() {
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [, setTick] = useState(0);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor/active");
      if (res.ok) {
        const data = await res.json();
        setAgents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch active agents:", err);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, 3000);
    return () => clearInterval(id);
  }, [fetchAgents]);

  // tick every second so durations update
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleTerminate = async (taskId: number) => {
    if (!confirm(`Terminate agent for task #${taskId}?`)) return;
    try {
      await fetch(`/api/monitor/terminate/${taskId}`, { method: "POST" });
      fetchAgents();
    } catch (err) {
      console.error("Failed to terminate agent:", err);
    }
  };

  if (agents.length === 0) {
    return (
      <p className="text-neutral-500 dark:text-neutral-400 py-8 text-center">
        No agents currently active
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {agents.map((a) => (
        <div
          key={a.task_id}
          className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  #{a.task_id}
                </span>
                <TypeBadge type={a.task_type} />
                <span className="font-medium truncate">{a.title}</span>
              </div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400 space-y-0.5">
                <p>
                  Phase:{" "}
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {a.current_phase || a.status}
                  </span>
                </p>
                {a.process_id != null && (
                  <p>
                    PID: {a.process_id}
                    {a.cpu_percent != null && ` | CPU: ${a.cpu_percent.toFixed(1)}%`}
                    {a.memory_mb != null && ` | Mem: ${a.memory_mb.toFixed(1)} MB`}
                  </p>
                )}
                {a.current_file && (
                  <p className="truncate">
                    File:{" "}
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {a.current_file}
                    </span>
                  </p>
                )}
                <p>
                  Running:{" "}
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {formatDuration(a.started_at)}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={() => handleTerminate(a.task_id)}
              className="shrink-0 px-3 py-1.5 text-sm rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              Terminate
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2: Task Queue                                                  */
/* ------------------------------------------------------------------ */

type QueueFilter = "all" | "development" | "investigation" | "decompose";

const QUEUED_STATUSES = ["waiting_for_dev", "decompose_understanding", "decompose_approved"];
const IN_PROGRESS_STATUSES = [
  "developing", "decompose_breaking_down", "decompose_reflecting",
  "waiting_for_review", "decompose_waiting_for_answers",
  "decompose_waiting_for_approval", "decompose_waiting_for_completion",
];
const COMPLETED_STATUSES = ["finished", "decompose_complete"];
const FAILED_STATUSES = ["failed", "cancelled"];

function TaskQueueTab() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [filter, setFilter] = useState<QueueFilter>("all");

  const fetchTasks = useCallback(async () => {
    try {
      const typeParam = filter === "development" ? "worker" : filter;
      const url =
        filter === "all"
          ? "/api/monitor/queue"
          : `/api/monitor/queue?type=${typeParam}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch task queue:", err);
    }
  }, [filter]);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 5000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  const queued = tasks.filter((t) => QUEUED_STATUSES.includes(t.status));
  const inProgress = tasks.filter((t) => IN_PROGRESS_STATUSES.includes(t.status));
  const completed = tasks.filter((t) => COMPLETED_STATUSES.includes(t.status));
  const failed = tasks.filter((t) => FAILED_STATUSES.includes(t.status));

  const filters: { label: string; value: QueueFilter }[] = [
    { label: "All", value: "all" },
    { label: "Development", value: "development" },
    { label: "Investigation", value: "investigation" },
    { label: "Decompose", value: "decompose" },
  ];

  const renderSection = (title: string, items: QueueTask[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
          {title} ({items.length})
        </h3>
        <div className="space-y-1">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2 rounded border border-neutral-200 dark:border-neutral-700 text-sm"
            >
              <span className="text-neutral-500 dark:text-neutral-400 shrink-0">
                #{t.id}
              </span>
              <TypeBadge type={t.task_type} />
              <span className="flex-1 truncate">{t.title}</span>
              <StatusBadge status={t.status} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              filter === f.value
                ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400 py-8 text-center">
          No tasks in queue
        </p>
      ) : (
        <>
          {renderSection("Queued", queued)}
          {renderSection("In Progress", inProgress)}
          {renderSection("Completed", completed)}
          {renderSection("Failed / Cancelled", failed)}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3: Reports                                                     */
/* ------------------------------------------------------------------ */

function AgentTab() {
  return (
    <div className="text-center py-12">
      <p className="text-neutral-500 dark:text-neutral-400 text-lg mb-2">
        Agent Tab (Placeholder)
      </p>
      <p className="text-neutral-400 dark:text-neutral-500 text-sm">
        This is a dummy section for future agent functionality.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4: Reports                                                     */
/* ------------------------------------------------------------------ */

function InvestigationForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/investigation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), prompt: prompt.trim() }),
      });
      if (res.ok) {
        onCreated();
      }
    } catch (err) {
      console.error("Failed to submit investigation:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 mb-4 space-y-3"
    >
      <input
        type="text"
        placeholder="Investigation title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-1 focus:ring-blue-500"
      />
      <textarea
        placeholder="Describe what to investigate..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-1 focus:ring-blue-500 resize-y"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !title.trim() || !prompt.trim()}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReportViewer({
  taskId,
  onBack,
}: {
  taskId: number;
  onBack: () => void;
}) {
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/investigation/reports/${taskId}`);
        if (res.ok) {
          setReport(await res.json());
        }
      } catch (err) {
        console.error("Failed to load report:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId]);

  if (loading) {
    return <p className="text-neutral-500 dark:text-neutral-400 py-8 text-center">Loading report...</p>;
  }

  if (!report) {
    return <p className="text-neutral-500 dark:text-neutral-400 py-8 text-center">Report not found</p>;
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-blue-500 hover:text-blue-400 transition-colors"
      >
        &larr; Back to reports
      </button>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{report.title}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Task #{report.task_id} &middot; Created{" "}
          {new Date(report.created_at).toLocaleString()}
        </p>
      </div>
      <pre className="text-sm whitespace-pre-wrap leading-relaxed text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 overflow-auto max-h-[70vh]">
        {report.report_markdown}
      </pre>
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [viewReport, setViewReport] = useState<number | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/investigation/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  if (viewReport !== null) {
    return <ReportViewer taskId={viewReport} onBack={() => setViewReport(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Investigation Reports
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            New Investigation
          </button>
        )}
      </div>

      {showForm && (
        <InvestigationForm
          onCreated={() => {
            setShowForm(false);
            fetchReports();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {reports.length === 0 ? (
        <p className="text-neutral-500 dark:text-neutral-400 py-8 text-center">
          No reports yet
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.task_id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded border border-neutral-200 dark:border-neutral-700"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{r.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Task #{r.task_id} &middot;{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setViewReport(r.task_id)}
                className="shrink-0 px-3 py-1.5 text-sm rounded text-blue-500 hover:bg-blue-600/10 transition-colors"
              >
                View Report
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const TABS: { label: string; value: Tab }[] = [
  { label: "Active Agents", value: "active" },
  { label: "Task Queue", value: "queue" },
  { label: "Reports", value: "reports" },
  { label: "Agent", value: "agent" },
];

export default function MonitorPage() {
  const [tab, setTab] = useState<Tab>("active");

  return (
    <PageContainer title="Monitor">
      <div className="flex gap-2 mb-6 border-b border-neutral-200 dark:border-neutral-700 pb-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm rounded-t transition-colors ${
              tab === t.value
                ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium"
                : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "active" && <ActiveAgentsTab />}
      {tab === "queue" && <TaskQueueTab />}
      {tab === "agent" && <AgentTab />}
      {tab === "reports" && <ReportsTab />}
    </PageContainer>
  );
}
