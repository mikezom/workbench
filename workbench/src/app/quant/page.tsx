"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  status: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  benchmark: string;
  rebalance_freq: string;
  top_n: number;
  commission: number;
  config: Record<string, unknown>;
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

type ResultViewTab = "overview" | "yearly" | "features" | "trades" | "assets" | "diagnostics";

const RESULT_VIEW_TABS: Array<{ id: ResultViewTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "yearly", label: "Yearly" },
  { id: "features", label: "Feature Importance" },
  { id: "trades", label: "Trades" },
  { id: "assets", label: "Asset Earnings" },
  { id: "diagnostics", label: "Diagnostics" },
];

function ResultsTab({
  runs, selectedRunId, detail, onSelectRun,
}: {
  runs: BacktestRun[];
  selectedRunId: number | null;
  detail: BacktestDetail | null;
  onSelectRun: (id: number) => void;
}) {
  const completedRuns = runs.filter((r) => r.status === "completed");
  const [view, setView] = useState<ResultViewTab>("overview");

  useEffect(() => {
    setView("overview");
  }, [selectedRunId]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-lg font-semibold">Results</h2>
        <select
          value={selectedRunId ?? ""}
          onChange={(e) => onSelectRun(Number(e.target.value))}
          className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800"
        >
          <option value="">Select a backtest run...</option>
          {completedRuns.map((r) => (
            <option key={r.id} value={r.id}>
              #{r.id} — {r.start_date} to {r.end_date}
            </option>
          ))}
        </select>
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

      {!detail?.results && (
        <div className="text-neutral-400 dark:text-neutral-500 text-center py-20 text-sm">
          {completedRuns.length === 0
            ? "No completed backtests yet. Run a backtest first."
            : "Select a completed backtest run to view results."}
        </div>
      )}

      {detail?.results && (
        <div className="space-y-6">
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">
                  {detail.strategy?.name ?? `Backtest #${detail.run.id}`}
                </div>
                <div className="text-sm text-neutral-500 mt-1">
                  {detail.run.start_date} – {detail.run.end_date}
                </div>
              </div>
              <StatusBadge status={detail.run.status} />
            </div>

            <div className="grid grid-cols-4 gap-3 portrait:grid-cols-2">
              <MetadataItem label="Model" value={detail.strategy?.model_type ?? "—"} />
              <MetadataItem label="Universe" value={detail.strategy?.universe ?? "—"} />
              <MetadataItem label="Benchmark" value={detail.run.benchmark} />
              <MetadataItem label="Rebalance" value={detail.run.rebalance_freq} />
              <MetadataItem label="Top N" value={String(detail.run.top_n)} />
              <MetadataItem label="Train Window" value={`${detail.run.config.train_window_days ?? 240} days`} />
              <MetadataItem label="Horizon" value={`${detail.run.config.prediction_horizon_days ?? 20} days`} />
              <MetadataItem label="Factors" value={String(detail.strategy?.factors.length ?? 0)} />
            </div>
          </div>

          <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
            {RESULT_VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-3 py-2 text-sm rounded-t ${
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
            <div className="space-y-6">
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
              />

              <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
                <EquityChart
                  data={detail.results.equity_curve}
                  benchmarkCurve={detail.results.benchmark_curve}
                  initialCapital={detail.run.initial_capital}
                />
              </div>

              <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
                <MonthlyReturnsHeatmap data={detail.results.monthly_returns} />
              </div>
            </div>
          )}

          {view === "yearly" && (
            <YearlyPerformanceTable rows={detail.results.yearly_performance} />
          )}

          {view === "features" && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded p-4">
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

          {view === "diagnostics" && (
            <DiagnosticsPanel diagnostics={detail.results.diagnostics} />
          )}
        </div>
      )}
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-sm mt-1">{value}</div>
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
