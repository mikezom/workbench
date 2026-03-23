"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BookmarkIcon as BookmarkOutlineIcon, TrashIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import StrategyList from "@/components/quant/strategy-list";
import StrategyForm from "@/components/quant/strategy-form";
import BacktestConfig from "@/components/quant/backtest-config";
import MetricsPanel from "@/components/quant/metrics-panel";
import EquityChart from "@/components/quant/equity-chart";
import MonthlyReturnsHeatmap from "@/components/quant/monthly-returns-heatmap";
import FactorAnalysis from "@/components/quant/factor-analysis";
import TradeLogTable from "@/components/quant/trade-log-table";
import YearlyPerformanceTable from "@/components/quant/yearly-performance-table";
import DiagnosticsPanel from "@/components/quant/diagnostics-panel";
import AssetEarningsTable from "@/components/quant/asset-earnings-table";
import FinalPortfolioPanel from "@/components/quant/final-portfolio-panel";
import {
  getPositionControlLabel,
  getTrailingStopLabel,
  type PositionControlConfig,
  type QuantBacktestConfig,
} from "@/lib/quant-backtest-config";

type Tab = "strategies" | "backtest" | "results" | "data";

const TABS: { id: Tab; label: string }[] = [
  { id: "strategies", label: "Strategies" },
  { id: "backtest", label: "Backtest" },
  { id: "results", label: "Results" },
  { id: "data", label: "Data" },
];

interface Strategy {
  id: number;
  name: string;
  description: string | null;
  factors: string[];
  model_type: string;
  hyperparams: Record<string, unknown>;
  universe: string;
  status: string;
  created_at: string;
}

interface BacktestRun {
  id: number;
  strategy_id: number;
  strategy_snapshot: Strategy | null;
  bookmarked: boolean;
  status: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  benchmark: string;
  rebalance_freq: string;
  top_n: number;
  commission: number;
  config: QuantBacktestConfig;
  progress_percent: number;
  progress_message: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface BacktestDetail {
  run: BacktestRun;
  strategy: Strategy | null;
  results: {
    total_return: number;
    annualized_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_trades: number;
    alpha: number;
    beta: number;
    benchmark_return: number | null;
    benchmark_curve: Array<{ date: string; value: number }> | null;
    equity_curve: Array<{ date: string; value: number }>;
    monthly_returns: Array<{ year: number; month: number; return: number }>;
    yearly_performance: Array<{
      year: number;
      strategy_return: number;
      benchmark_return: number | null;
      excess_return: number | null;
    }>;
    factor_importance: Record<string, number>;
    diagnostics: {
      rank_ic: Array<{ date: string; value: number }>;
      score_dispersion: Array<{ date: string; mean: number; std: number; min: number; max: number }>;
      top_bottom_spread: Array<{ date: string; value: number }>;
      grouped_return: Array<{ bucket: string; avg_return: number }>;
      audit?: {
        future_label_overlap?: {
          status: string;
          checked_windows: number;
          candidate_rows: number;
          blocked_overlap_rows: number;
          flagged_windows: number;
          sample_windows: Array<{
            signal_date: string;
            blocked_overlap_rows: number;
          }>;
        };
        execution_timing?: {
          status: string;
          signal_source: string;
          execution_source: string;
          bars_between_signal_and_execution: number;
        };
      };
    } | null;
  } | null;
  trades: Array<{
    id: number;
    date: string;
    symbol: string;
    name: string;
    direction: string;
    quantity: number;
    price: number;
    amount: number;
    commission: number;
    reason: string | null;
    realized_pnl: number | null;
    realized_return: number | null;
  }>;
}

interface DataSummary {
  stockCount: number;
  ohlcvCount: number;
  finaCount: number;
  dateRange: { min: string; max: string } | null;
}

export default function QuantPage() {
  const [activeTab, setActiveTab] = useState<Tab>("strategies");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [backtestRuns, setBacktestRuns] = useState<BacktestRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [backtestDetail, setBacktestDetail] = useState<BacktestDetail | null>(null);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [resultActionRunId, setResultActionRunId] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStrategies = useCallback(async () => {
    const res = await fetch("/api/quant/strategies");
    const data = await res.json();
    setStrategies(data);
  }, []);

  const fetchBacktestRuns = useCallback(async () => {
    const res = await fetch("/api/quant/backtest");
    const data = await res.json();
    setBacktestRuns(data);
  }, []);

  const fetchDataSummary = useCallback(async () => {
    const res = await fetch("/api/quant/data");
    const data = await res.json();
    setDataSummary(data);
  }, []);

  useEffect(() => {
    fetchStrategies();
    fetchBacktestRuns();
    fetchDataSummary();
  }, [fetchStrategies, fetchBacktestRuns, fetchDataSummary]);

  // Poll for running backtests
  useEffect(() => {
    const hasRunning = backtestRuns.some((r) => r.status === "running" || r.status === "pending");
    if (hasRunning) {
      pollRef.current = setInterval(() => {
        fetchBacktestRuns();
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [backtestRuns, fetchBacktestRuns]);

  // Load backtest detail
  useEffect(() => {
    if (!selectedRunId) {
      setBacktestDetail(null);
      return;
    }
    fetch(`/api/quant/backtest/${selectedRunId}`)
      .then((r) => r.json())
      .then(setBacktestDetail)
      .catch(console.error);
  }, [selectedRunId]);

  const handleCreateStrategy = async (data: {
    name: string;
    description: string;
    factors: string[];
    model_type: string;
    hyperparams: Record<string, unknown>;
    universe: string;
  }) => {
    if (editingStrategy) {
      await fetch(`/api/quant/strategies/${editingStrategy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/quant/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setShowForm(false);
    setEditingStrategy(null);
    fetchStrategies();
  };

  const handleDeleteStrategy = async (id: number) => {
    await fetch(`/api/quant/strategies/${id}`, { method: "DELETE" });
    fetchStrategies();
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRunBacktest = (strategyId: number) => {
    setActiveTab("backtest");
  };

  const handleSubmitBacktest = async (config: {
    strategy_id: number;
    start_date: string;
    end_date: string;
    initial_capital: number;
    benchmark: string;
    rebalance_freq: string;
    top_n: number;
    commission: number;
    train_window_days: number;
    prediction_horizon_days: number;
    position_control: PositionControlConfig;
  }) => {
    await fetch("/api/quant/backtest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    fetchBacktestRuns();
  };

  const handleSyncData = async (dryRun: boolean) => {
    setSyncing(true);
    try {
      await fetch("/api/quant/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: dryRun }),
      });
      // Refresh summary after a short delay for the process to start
      setTimeout(fetchDataSummary, 3000);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleBookmark = async (runId: number, bookmarked: boolean) => {
    setResultActionRunId(runId);
    try {
      await fetch(`/api/quant/backtest/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarked }),
      });
      await fetchBacktestRuns();
      if (selectedRunId === runId) {
        const res = await fetch(`/api/quant/backtest/${runId}`);
        setBacktestDetail(await res.json());
      }
    } finally {
      setResultActionRunId(null);
    }
  };

  const handleDeleteResult = async (runId: number) => {
    if (!window.confirm(`Delete backtest result #${runId}? This will remove the run, result, and trade log.`)) {
      return;
    }

    const remainingCompletedRuns = backtestRuns
      .filter((run) => run.status === "completed" && run.id !== runId)
      .sort(compareRunsForResults);
    const nextRunId = selectedRunId === runId ? (remainingCompletedRuns[0]?.id ?? null) : selectedRunId;

    setResultActionRunId(runId);
    try {
      await fetch(`/api/quant/backtest/${runId}`, { method: "DELETE" });
      setSelectedRunId(nextRunId);
      if (!nextRunId) {
        setBacktestDetail(null);
      }
      await fetchBacktestRuns();
      if (nextRunId) {
        const res = await fetch(`/api/quant/backtest/${nextRunId}`);
        setBacktestDetail(await res.json());
      }
    } finally {
      setResultActionRunId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="border-b border-neutral-200 dark:border-neutral-800 px-6 pt-4">
        <h1 className="text-2xl font-bold mb-3">Quant</h1>
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-t transition-colors ${
                activeTab === tab.id
                  ? "bg-white dark:bg-neutral-800 border border-b-0 border-neutral-200 dark:border-neutral-700 font-medium"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        {activeTab === "strategies" && (
          <StrategiesTab
            strategies={strategies}
            showForm={showForm}
            editingStrategy={editingStrategy}
            onShowForm={() => { setShowForm(true); setEditingStrategy(null); }}
            onEdit={(s) => { setEditingStrategy(s); setShowForm(true); }}
            onDelete={handleDeleteStrategy}
            onRunBacktest={handleRunBacktest}
            onSubmit={handleCreateStrategy}
            onCancel={() => { setShowForm(false); setEditingStrategy(null); }}
          />
        )}
        {activeTab === "backtest" && (
          <BacktestTab
            strategies={strategies}
            runs={backtestRuns}
            onSubmit={handleSubmitBacktest}
            onSelectRun={(id) => { setSelectedRunId(id); setActiveTab("results"); }}
          />
        )}
        {activeTab === "results" && (
          <ResultsTab
            runs={backtestRuns}
            selectedRunId={selectedRunId}
            detail={backtestDetail}
            onSelectRun={setSelectedRunId}
            actionRunId={resultActionRunId}
            onToggleBookmark={handleToggleBookmark}
            onDeleteRun={handleDeleteResult}
          />
        )}
        {activeTab === "data" && (
          <DataTab
            summary={dataSummary}
            syncing={syncing}
            onSync={handleSyncData}
            onRefresh={fetchDataSummary}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strategies Tab
// ---------------------------------------------------------------------------

function StrategiesTab({
  strategies, showForm, editingStrategy, onShowForm, onEdit, onDelete, onRunBacktest, onSubmit, onCancel,
}: {
  strategies: Strategy[];
  showForm: boolean;
  editingStrategy: Strategy | null;
  onShowForm: () => void;
  onEdit: (s: Strategy) => void;
  onDelete: (id: number) => void;
  onRunBacktest: (id: number) => void;
  onSubmit: (data: { name: string; description: string; factors: string[]; model_type: string; hyperparams: Record<string, unknown>; universe: string }) => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Strategies</h2>
        {!showForm && (
          <button
            onClick={onShowForm}
            className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90"
          >
            New Strategy
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 border border-neutral-200 dark:border-neutral-700 rounded p-4">
          <h3 className="text-sm font-semibold mb-3">
            {editingStrategy ? "Edit Strategy" : "New Strategy"}
          </h3>
          <StrategyForm
            initial={editingStrategy ? {
              id: editingStrategy.id,
              name: editingStrategy.name,
              description: editingStrategy.description ?? "",
              factors: editingStrategy.factors,
              model_type: editingStrategy.model_type,
              hyperparams: editingStrategy.hyperparams,
              universe: editingStrategy.universe,
            } : undefined}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      )}

      <StrategyList
        strategies={strategies}
        onEdit={onEdit}
        onDelete={onDelete}
        onRunBacktest={onRunBacktest}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backtest Tab
// ---------------------------------------------------------------------------

function BacktestTab({
  strategies, runs, onSubmit, onSelectRun,
}: {
  strategies: Strategy[];
  runs: BacktestRun[];
  onSubmit: (config: {
    strategy_id: number;
    start_date: string;
    end_date: string;
    initial_capital: number;
    benchmark: string;
    rebalance_freq: string;
    top_n: number;
    commission: number;
    train_window_days: number;
    prediction_horizon_days: number;
    position_control: PositionControlConfig;
  }) => void;
  onSelectRun: (id: number) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Run Backtest</h2>
      <BacktestConfig strategies={strategies} onSubmit={onSubmit} />

      {runs.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold mb-3">Recent Runs</h3>
          <div className="space-y-2">
            {runs.slice(0, 10).map((run) => (
              <div
                key={run.id}
                className="border border-neutral-200 dark:border-neutral-700 rounded px-4 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono">#{run.id}</span>
                    <StatusBadge status={run.status} />
                    <span className="text-neutral-500">{run.start_date} – {run.end_date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {(run.status === "running" || run.status === "pending") && (
                      <span className="text-xs text-neutral-500 font-mono">
                        {Math.round(run.progress_percent ?? 0)}%
                      </span>
                    )}
                    {run.status === "completed" && (
                      <button
                        onClick={() => onSelectRun(run.id)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View Results
                      </button>
                    )}
                    {run.status === "failed" && run.error_message && (
                      <span className="text-xs text-red-500 truncate max-w-xs" title={run.error_message}>
                        {run.error_message}
                      </span>
                    )}
                  </div>
                </div>

                {(run.status === "running" || run.status === "pending") && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>{run.progress_message ?? "Preparing backtest..."}</span>
                      <span>{Math.round(run.progress_percent ?? 0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-400 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, run.progress_percent ?? 0))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results Tab
// ---------------------------------------------------------------------------

type ResultViewTab = "overview" | "yearly" | "features" | "trades" | "assets" | "finalPortfolio" | "diagnostics";

const RESULT_VIEW_TABS: Array<{ id: ResultViewTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "yearly", label: "Yearly" },
  { id: "features", label: "Feature Importance" },
  { id: "trades", label: "Trades" },
  { id: "assets", label: "Asset Earnings" },
  { id: "finalPortfolio", label: "Final Portfolio" },
  { id: "diagnostics", label: "Diagnostics" },
];

function ResultsTab({
  runs, selectedRunId, detail, onSelectRun, actionRunId, onToggleBookmark, onDeleteRun,
}: {
  runs: BacktestRun[];
  selectedRunId: number | null;
  detail: BacktestDetail | null;
  onSelectRun: (id: number) => void;
  actionRunId: number | null;
  onToggleBookmark: (id: number, bookmarked: boolean) => void;
  onDeleteRun: (id: number) => void;
}) {
  const completedRuns = runs.filter((r) => r.status === "completed").sort(compareRunsForResults);
  const [view, setView] = useState<ResultViewTab>("overview");

  useEffect(() => {
    setView("overview");
  }, [selectedRunId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="text-sm text-neutral-500 mt-1">
            {completedRuns.length} completed runs. Bookmarked runs stay pinned at the top.
          </p>
        </div>
        {selectedRunId && (
          <a
            href={`/api/quant/backtest/${selectedRunId}/report`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Export Report
          </a>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 h-fit xl:sticky xl:top-6">
          {completedRuns.length === 0 ? (
            <div className="text-neutral-400 dark:text-neutral-500 text-sm py-8 text-center">
              No completed backtests yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-[70vh] overflow-auto pr-1 custom-scrollbar">
              {completedRuns.map((run) => (
                <ResultRunCard
                  key={run.id}
                  run={run}
                  selected={selectedRunId === run.id}
                  busy={actionRunId === run.id}
                  onSelect={onSelectRun}
                  onToggleBookmark={onToggleBookmark}
                  onDelete={onDeleteRun}
                />
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {!detail?.results && (
            <div className="text-neutral-400 dark:text-neutral-500 text-center py-20 text-sm border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
              {completedRuns.length === 0
                ? "Run a backtest first to populate this view."
                : "Select a completed run from the left to inspect its result."}
            </div>
          )}

          {detail?.results && (
            <div className="space-y-4">
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3.5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-lg font-semibold truncate">
                        {detail.strategy?.name ?? `Backtest #${detail.run.id}`}
                      </div>
                      {detail.run.bookmarked && (
                        <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px]">
                          Bookmarked
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-neutral-500 mt-1">
                      Run #{detail.run.id} • {detail.run.start_date} – {detail.run.end_date}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={detail.run.status} />
                    <button
                      type="button"
                      onClick={() => onToggleBookmark(detail.run.id, !detail.run.bookmarked)}
                      disabled={actionRunId === detail.run.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {detail.run.bookmarked ? (
                        <BookmarkSolidIcon className="w-4 h-4" />
                      ) : (
                        <BookmarkOutlineIcon className="w-4 h-4" />
                      )}
                      {detail.run.bookmarked ? "Saved" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRun(detail.run.id)}
                      disabled={actionRunId === detail.run.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                    >
                      <TrashIcon className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <MetadataItem compact label="Model" value={detail.strategy?.model_type ?? "—"} />
                  <MetadataItem compact label="Universe" value={detail.strategy?.universe ?? "—"} />
                  <MetadataItem compact label="Benchmark" value={detail.run.benchmark} />
                  <MetadataItem compact label="Rebalance" value={detail.run.rebalance_freq} />
                  <MetadataItem compact label="Top N" value={String(detail.run.top_n)} />
                  <MetadataItem compact label="Train Window" value={`${detail.run.config.train_window_days ?? 240}d`} />
                  <MetadataItem compact label="Horizon" value={`${detail.run.config.prediction_horizon_days ?? 20}d`} />
                  <MetadataItem compact label="Position Control" value={getPositionControlLabel(detail.run.config.position_control)} />
                  <MetadataItem compact label="Factors" value={String(detail.strategy?.factors.length ?? 0)} />
                </div>
              </div>

              <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700 overflow-auto">
                {RESULT_VIEW_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    className={`px-3 py-2 text-sm rounded-t whitespace-nowrap ${
                      view === tab.id
                        ? "bg-white dark:bg-neutral-800 border border-b-0 border-neutral-200 dark:border-neutral-700 font-medium"
                        : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {view === "overview" && (
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] items-start">
                  <div className="space-y-4 min-w-0">
                    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                      <EquityChart
                        data={detail.results.equity_curve}
                        benchmarkCurve={detail.results.benchmark_curve}
                        initialCapital={detail.run.initial_capital}
                      />
                    </div>

                    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                      <MonthlyReturnsHeatmap data={detail.results.monthly_returns} />
                    </div>
                  </div>

                  <div className="space-y-4 min-w-0">
                    <MetricsPanel
                      totalReturn={detail.results.total_return}
                      annualizedReturn={detail.results.annualized_return}
                      sharpeRatio={detail.results.sharpe_ratio}
                      maxDrawdown={detail.results.max_drawdown}
                      winRate={detail.results.win_rate}
                      profitFactor={detail.results.profit_factor}
                      totalTrades={detail.results.total_trades}
                      alpha={detail.results.alpha}
                      beta={detail.results.beta}
                      compact
                    />

                    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-2">
                      <div className="text-sm font-semibold">Run Notes</div>
                      <div className="grid grid-cols-2 gap-2">
                        <MetadataItem compact label="Capital" value={detail.run.initial_capital.toLocaleString()} />
                        <MetadataItem compact label="Commission" value={detail.run.commission.toFixed(4)} />
                        <MetadataItem compact label="Trailing Stop" value={getTrailingStopLabel(detail.run.config.trailing_stop)} />
                        <MetadataItem compact label="Created" value={detail.run.created_at} />
                        <MetadataItem compact label="Completed" value={detail.run.completed_at ?? "—"} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {view === "yearly" && (
                <YearlyPerformanceTable rows={detail.results.yearly_performance} />
              )}

              {view === "features" && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
                  <FactorAnalysis importance={detail.results.factor_importance} />
                </div>
              )}

              {view === "trades" && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Trade Log ({detail.trades.length} trades)</h3>
                  <TradeLogTable trades={detail.trades} />
                </div>
              )}

              {view === "assets" && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Assets Ranked By Earnings</h3>
                  <AssetEarningsTable trades={detail.trades} />
                </div>
              )}

              {view === "finalPortfolio" && (
                <FinalPortfolioPanel
                  trades={detail.trades}
                  defaultCapital={detail.run.initial_capital}
                />
              )}

              {view === "diagnostics" && (
                <DiagnosticsPanel diagnostics={detail.results.diagnostics} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetadataItem({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`border border-neutral-200 dark:border-neutral-700 rounded ${compact ? "px-2.5 py-2" : "px-3 py-2"}`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`${compact ? "text-[13px]" : "text-sm"} mt-1 break-words`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Tab
// ---------------------------------------------------------------------------

function DataTab({
  summary, syncing, onSync, onRefresh,
}: {
  summary: DataSummary | null;
  syncing: boolean;
  onSync: (dryRun: boolean) => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Market Data</h2>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Refresh
          </button>
          <button
            onClick={() => onSync(true)}
            disabled={syncing}
            className="px-3 py-1.5 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Mock Data"}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
            <div className="text-xs text-neutral-400">Stocks</div>
            <div className="text-2xl font-mono mt-1">{summary.stockCount}</div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
            <div className="text-xs text-neutral-400">OHLCV Records</div>
            <div className="text-2xl font-mono mt-1">{summary.ohlcvCount.toLocaleString()}</div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
            <div className="text-xs text-neutral-400">Financial Records</div>
            <div className="text-2xl font-mono mt-1">{summary.finaCount.toLocaleString()}</div>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
            <div className="text-xs text-neutral-400">Date Range</div>
            <div className="text-sm font-mono mt-1">
              {summary.dateRange
                ? `${summary.dateRange.min} – ${summary.dateRange.max}`
                : "No data"}
            </div>
          </div>
        </div>
      )}

      {!summary && (
        <div className="text-neutral-400 dark:text-neutral-500 text-center py-20 text-sm">
          No market data loaded yet. Click &quot;Sync Mock Data&quot; to populate with test data.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300",
    running: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
    completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] ?? ""}`}>
      {status}
    </span>
  );
}

function compareRunsForResults(a: BacktestRun, b: BacktestRun): number {
  if (a.bookmarked !== b.bookmarked) {
    return Number(b.bookmarked) - Number(a.bookmarked);
  }

  const aDate = a.completed_at ?? a.created_at;
  const bDate = b.completed_at ?? b.created_at;
  return bDate.localeCompare(aDate) || b.id - a.id;
}

function ResultRunCard({
  run,
  selected,
  busy,
  onSelect,
  onToggleBookmark,
  onDelete,
}: {
  run: BacktestRun;
  selected: boolean;
  busy: boolean;
  onSelect: (id: number) => void;
  onToggleBookmark: (id: number, bookmarked: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const title = run.strategy_snapshot?.name ?? `Backtest #${run.id}`;
  const BookmarkIcon = run.bookmarked ? BookmarkSolidIcon : BookmarkOutlineIcon;

  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500/60"
          : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onSelect(run.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="font-mono">#{run.id}</span>
            <span>•</span>
            <span>{run.start_date}–{run.end_date}</span>
          </div>
          <div className="font-medium text-sm mt-1 truncate">{title}</div>
          <div className="text-xs text-neutral-500 mt-1">
            {run.strategy_snapshot?.universe ?? "—"} • {run.rebalance_freq}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label={run.bookmarked ? "Remove bookmark" : "Bookmark result"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleBookmark(run.id, !run.bookmarked);
            }}
            disabled={busy}
            className="rounded p-1 text-neutral-500 hover:text-amber-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            <BookmarkIcon className={`w-4 h-4 ${run.bookmarked ? "text-amber-500" : ""}`} />
          </button>
          <button
            type="button"
            aria-label="Delete result"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(run.id);
            }}
            disabled={busy}
            className="rounded p-1 text-neutral-500 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
