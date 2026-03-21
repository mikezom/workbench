import type Database from "better-sqlite3";
import { getDb } from "./db";
import { normalizeBenchmarkCode } from "./quant-benchmark";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initQuantSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quant_factors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('price', 'volume', 'fundamental', 'technical')),
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quant_strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      factors TEXT NOT NULL DEFAULT '[]',
      model_type TEXT NOT NULL DEFAULT 'linear_regression'
        CHECK (model_type IN ('linear_regression', 'ridge', 'lasso', 'random_forest', 'xgboost')),
      hyperparams TEXT NOT NULL DEFAULT '{}',
      universe TEXT NOT NULL DEFAULT 'HS300'
        CHECK (universe IN ('HS300', 'ZZ500', 'ZZ1000', 'ALL', 'CUSTOM')),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'backtesting', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quant_backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES quant_strategies(id) ON DELETE CASCADE,
      strategy_snapshot TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      initial_capital REAL NOT NULL DEFAULT 1000000,
      benchmark TEXT NOT NULL DEFAULT '000300.SH',
      rebalance_freq TEXT NOT NULL DEFAULT 'weekly'
        CHECK (rebalance_freq IN ('daily', 'weekly', 'monthly')),
      top_n INTEGER NOT NULL DEFAULT 10,
      commission REAL NOT NULL DEFAULT 0.001,
      config TEXT NOT NULL DEFAULT '{}',
      progress_percent REAL NOT NULL DEFAULT 0,
      progress_message TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_runs_strategy
      ON quant_backtest_runs(strategy_id);

    CREATE TABLE IF NOT EXISTS quant_backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES quant_backtest_runs(id) ON DELETE CASCADE,
      total_return REAL,
      annualized_return REAL,
      sharpe_ratio REAL,
      max_drawdown REAL,
      win_rate REAL,
      profit_factor REAL,
      total_trades INTEGER,
      alpha REAL,
      beta REAL,
      benchmark_return REAL,
      benchmark_curve TEXT,
      equity_curve TEXT,
      monthly_returns TEXT,
      yearly_performance TEXT,
      factor_importance TEXT,
      diagnostics TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_backtest_results_run
      ON quant_backtest_results(run_id);

    CREATE TABLE IF NOT EXISTS quant_trade_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES quant_backtest_runs(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      commission REAL NOT NULL DEFAULT 0,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trade_log_run
      ON quant_trade_log(run_id, date);
  `);

  migrateQuantSchema(db);
  seedFactors(db);
  reconcileStrategyStatuses(db);
}

function migrateQuantSchema(db: Database.Database): void {
  const strategyTable = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quant_strategies'"
  ).get() as { sql: string } | undefined;
  if (strategyTable?.sql && !strategyTable.sql.includes("'CUSTOM'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      CREATE TABLE quant_strategies_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        factors TEXT NOT NULL DEFAULT '[]',
        model_type TEXT NOT NULL DEFAULT 'linear_regression'
          CHECK (model_type IN ('linear_regression', 'ridge', 'lasso', 'random_forest', 'xgboost')),
        hyperparams TEXT NOT NULL DEFAULT '{}',
        universe TEXT NOT NULL DEFAULT 'HS300'
          CHECK (universe IN ('HS300', 'ZZ500', 'ZZ1000', 'ALL', 'CUSTOM')),
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'ready', 'backtesting', 'completed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO quant_strategies_new (
        id, name, description, factors, model_type, hyperparams, universe, status, created_at, updated_at
      )
      SELECT
        id, name, description, factors, model_type, hyperparams, universe, status, created_at, updated_at
      FROM quant_strategies;

      DROP TABLE quant_strategies;
      ALTER TABLE quant_strategies_new RENAME TO quant_strategies;

      PRAGMA foreign_keys = ON;
    `);
  }

  const resultColumns = db.prepare("PRAGMA table_info(quant_backtest_results)").all() as Array<{ name: string }>;
  const runColumns = db.prepare("PRAGMA table_info(quant_backtest_runs)").all() as Array<{ name: string }>;
  const hasBenchmarkCurve = resultColumns.some((column) => column.name === "benchmark_curve");
  const hasYearlyPerformance = resultColumns.some((column) => column.name === "yearly_performance");
  const hasDiagnostics = resultColumns.some((column) => column.name === "diagnostics");
  const hasProgressPercent = runColumns.some((column) => column.name === "progress_percent");
  const hasProgressMessage = runColumns.some((column) => column.name === "progress_message");
  const hasStrategySnapshot = runColumns.some((column) => column.name === "strategy_snapshot");

  if (!hasBenchmarkCurve) {
    db.exec("ALTER TABLE quant_backtest_results ADD COLUMN benchmark_curve TEXT");
  }
  if (!hasYearlyPerformance) {
    db.exec("ALTER TABLE quant_backtest_results ADD COLUMN yearly_performance TEXT");
  }
  if (!hasDiagnostics) {
    db.exec("ALTER TABLE quant_backtest_results ADD COLUMN diagnostics TEXT");
  }
  if (!hasProgressPercent) {
    db.exec("ALTER TABLE quant_backtest_runs ADD COLUMN progress_percent REAL NOT NULL DEFAULT 0");
  }
  if (!hasProgressMessage) {
    db.exec("ALTER TABLE quant_backtest_runs ADD COLUMN progress_message TEXT");
  }
  if (!hasStrategySnapshot) {
    db.exec("ALTER TABLE quant_backtest_runs ADD COLUMN strategy_snapshot TEXT");
  }
}

function reconcileStrategyStatuses(db: Database.Database): void {
  const strategies = db.prepare("SELECT id, status FROM quant_strategies").all() as Array<{ id: number; status: string }>;
  const activeRunsStmt = db.prepare(
    "SELECT COUNT(*) as cnt FROM quant_backtest_runs WHERE strategy_id = ? AND status IN ('pending', 'running')"
  );
  const latestRunStmt = db.prepare(
    "SELECT status FROM quant_backtest_runs WHERE strategy_id = ? ORDER BY created_at DESC, id DESC LIMIT 1"
  );
  const updateStmt = db.prepare(
    "UPDATE quant_strategies SET status = ?, updated_at = datetime('now') WHERE id = ?"
  );

  for (const strategy of strategies) {
    if (strategy.status !== "backtesting") continue;

    const activeRuns = (activeRunsStmt.get(strategy.id) as { cnt: number }).cnt;
    if (activeRuns > 0) continue;

    const latestRun = latestRunStmt.get(strategy.id) as { status: string } | undefined;
    const nextStatus = latestRun?.status === "completed" ? "completed" : "ready";
    updateStmt.run(nextStatus, strategy.id);
  }
}

// ---------------------------------------------------------------------------
// Factor seed data
// ---------------------------------------------------------------------------

const FACTOR_SEEDS: Array<{ id: string; name: string; category: string; description: string }> = [
  // Price
  { id: "momentum_1m", name: "Momentum 1M", category: "price", description: "1-month price momentum" },
  { id: "momentum_3m", name: "Momentum 3M", category: "price", description: "3-month price momentum" },
  { id: "momentum_6m", name: "Momentum 6M", category: "price", description: "6-month price momentum" },
  { id: "momentum_12m", name: "Momentum 12M", category: "price", description: "12-month price momentum" },
  { id: "mean_reversion_5d", name: "Mean Reversion 5D", category: "price", description: "5-day mean reversion signal" },
  { id: "mean_reversion_20d", name: "Mean Reversion 20D", category: "price", description: "20-day mean reversion signal" },
  { id: "volatility_20d", name: "Volatility 20D", category: "price", description: "20-day rolling volatility" },
  { id: "volatility_60d", name: "Volatility 60D", category: "price", description: "60-day rolling volatility" },
  { id: "price_to_ma20", name: "Price/MA20", category: "price", description: "Price relative to 20-day moving average" },
  { id: "price_to_ma60", name: "Price/MA60", category: "price", description: "Price relative to 60-day moving average" },
  { id: "ret_20d", name: "Return 20D", category: "price", description: "20-day price return" },
  { id: "ret_60d", name: "Return 60D", category: "price", description: "60-day price return" },
  { id: "ma10_bias", name: "MA10 Bias", category: "price", description: "Price deviation from 10-day moving average" },
  { id: "ma20_bias", name: "MA20 Bias", category: "price", description: "Price deviation from 20-day moving average" },
  { id: "ma60_bias", name: "MA60 Bias", category: "price", description: "Price deviation from 60-day moving average" },
  { id: "ma10_slope", name: "MA10 Slope", category: "price", description: "10-day moving average slope" },
  { id: "ma20_slope", name: "MA20 Slope", category: "price", description: "20-day moving average slope" },
  { id: "ma60_slope", name: "MA60 Slope", category: "price", description: "60-day moving average slope" },
  { id: "position_20d", name: "Position 20D", category: "price", description: "Position within 20-day high-low range" },
  { id: "limit_up_gap", name: "Limit-Up Gap", category: "price", description: "Distance to the daily upper price limit" },
  { id: "limit_down_gap", name: "Limit-Down Gap", category: "price", description: "Distance to the daily lower price limit" },
  { id: "limit_hit_20d", name: "Limit Hits 20D", category: "price", description: "Rolling 20-day count of limit-up or limit-down closes" },
  { id: "beta_60d", name: "Beta 60D", category: "price", description: "60-day rolling beta versus the selected benchmark" },
  { id: "residual_vol_60d", name: "Residual Volatility 60D", category: "price", description: "60-day idiosyncratic volatility versus the benchmark" },
  { id: "relative_strength_vs_benchmark", name: "Relative Strength vs Benchmark", category: "price", description: "60-day return minus benchmark return" },
  { id: "adjusted_momentum_3m", name: "Adjusted Momentum 3M", category: "price", description: "3-month momentum using adjusted closes" },
  { id: "adjusted_momentum_6m", name: "Adjusted Momentum 6M", category: "price", description: "6-month momentum using adjusted closes" },
  { id: "adjusted_ret_20d", name: "Adjusted Return 20D", category: "price", description: "20-day return using adjusted closes" },
  { id: "adjusted_mean_reversion_20d", name: "Adjusted Mean Reversion 20D", category: "price", description: "20-day mean-reversion signal using adjusted closes" },
  // Volume
  { id: "volume_ratio_5d", name: "Volume Ratio 5D", category: "volume", description: "5-day volume ratio vs 20-day average" },
  { id: "volume_ratio_20d", name: "Volume Ratio 20D", category: "volume", description: "20-day volume ratio vs 60-day average" },
  { id: "obv_slope", name: "OBV Slope", category: "volume", description: "On-balance volume trend slope" },
  { id: "vwap_deviation", name: "VWAP Deviation", category: "volume", description: "Deviation from volume-weighted average price" },
  { id: "turnover_rate", name: "Turnover Rate", category: "volume", description: "Daily turnover rate" },
  { id: "vol_ratio", name: "Volume Ratio 5/20", category: "volume", description: "Volume ratio of 5-day average to 20-day average" },
  { id: "free_float_turnover", name: "Free Float Turnover", category: "volume", description: "Turnover rate based on free-float shares" },
  { id: "market_volume_ratio", name: "Market Volume Ratio", category: "volume", description: "Tushare daily volume ratio indicator" },
  { id: "net_mf_amount_ratio", name: "Net Money Flow Ratio", category: "volume", description: "Net money flow scaled by traded amount" },
  { id: "large_order_net_ratio", name: "Large Order Net Ratio", category: "volume", description: "Large-order buy/sell imbalance" },
  { id: "extra_large_order_imbalance", name: "Extra Large Order Imbalance", category: "volume", description: "Extra-large-order buy/sell imbalance" },
  { id: "margin_balance_to_float_mv", name: "Margin Balance / Float MV", category: "volume", description: "Margin balance relative to circulating market cap" },
  { id: "financing_buy_shock", name: "Financing Buy Shock", category: "volume", description: "Financing buy amount relative to its 20-day average" },
  { id: "short_pressure", name: "Short Pressure", category: "volume", description: "Securities-lending balance as a share of total margin balance" },
  { id: "top_list_flag", name: "Top List Flag", category: "volume", description: "Whether the stock appeared on the daily dragon-tiger list" },
  { id: "top_list_net_buy_ratio", name: "Top List Net Buy Ratio", category: "volume", description: "Average dragon-tiger list net-buy ratio for the day" },
  // Fundamental
  { id: "pe_ratio", name: "P/E Ratio", category: "fundamental", description: "Price-to-earnings ratio" },
  { id: "pb_ratio", name: "P/B Ratio", category: "fundamental", description: "Price-to-book ratio" },
  { id: "ps_ratio", name: "P/S Ratio", category: "fundamental", description: "Price-to-sales ratio" },
  { id: "roe", name: "ROE", category: "fundamental", description: "Return on equity" },
  { id: "roa", name: "ROA", category: "fundamental", description: "Return on assets" },
  { id: "revenue_growth_yoy", name: "Revenue Growth YoY", category: "fundamental", description: "Year-over-year revenue growth" },
  { id: "profit_growth_yoy", name: "Profit Growth YoY", category: "fundamental", description: "Year-over-year profit growth" },
  { id: "debt_to_equity", name: "Debt/Equity", category: "fundamental", description: "Debt-to-equity ratio" },
  { id: "dividend_yield", name: "Dividend Yield", category: "fundamental", description: "Annual dividend yield" },
  { id: "market_cap", name: "Market Cap", category: "fundamental", description: "Total market capitalization" },
  { id: "earnings_yield_ttm", name: "Earnings Yield TTM", category: "fundamental", description: "Inverse of trailing-twelve-month PE" },
  { id: "sales_yield_ttm", name: "Sales Yield TTM", category: "fundamental", description: "Inverse of trailing-twelve-month PS" },
  { id: "dividend_yield_ttm", name: "Dividend Yield TTM", category: "fundamental", description: "Trailing-twelve-month dividend yield" },
  { id: "float_market_cap", name: "Float Market Cap", category: "fundamental", description: "Circulating market capitalization" },
  { id: "free_float_ratio", name: "Free Float Ratio", category: "fundamental", description: "Free-float shares divided by total shares" },
  { id: "circulating_cap_ratio", name: "Circulating Cap Ratio", category: "fundamental", description: "Circulating market cap divided by total market cap" },
  { id: "grossprofit_margin", name: "Gross Profit Margin", category: "fundamental", description: "Gross profit margin" },
  { id: "netprofit_margin", name: "Net Profit Margin", category: "fundamental", description: "Net profit margin" },
  { id: "current_ratio", name: "Current Ratio", category: "fundamental", description: "Current assets divided by current liabilities" },
  { id: "quick_ratio", name: "Quick Ratio", category: "fundamental", description: "Quick ratio liquidity measure" },
  { id: "operating_revenue_yoy", name: "Operating Revenue YoY", category: "fundamental", description: "Year-over-year operating revenue growth" },
  { id: "listing_age", name: "Listing Age", category: "fundamental", description: "Days since listing" },
  { id: "northbound_holding_ratio", name: "Northbound Holding Ratio", category: "fundamental", description: "沪深股通持股占比" },
  { id: "northbound_holding_change_20d", name: "Northbound Holding Change 20D", category: "fundamental", description: "20-day change in northbound holding ratio" },
  { id: "insider_accumulation", name: "Insider Accumulation", category: "fundamental", description: "Rolling 180-day net insider shareholding change ratio" },
  { id: "ownership_concentration", name: "Ownership Concentration", category: "fundamental", description: "Top-10 float-holder ownership concentration" },
  // Technical
  { id: "rsi_14", name: "RSI 14", category: "technical", description: "14-day relative strength index" },
  { id: "macd_signal", name: "MACD Signal", category: "technical", description: "MACD signal line crossover" },
  { id: "macd_dif", name: "MACD DIF", category: "technical", description: "Difference between MACD fast and slow lines" },
  { id: "macd_hist", name: "MACD Histogram", category: "technical", description: "MACD histogram value" },
  { id: "bollinger_position", name: "Bollinger Position", category: "technical", description: "Position within Bollinger Bands" },
  { id: "atr_14", name: "ATR 14", category: "technical", description: "14-day average true range" },
  { id: "adx_14", name: "ADX 14", category: "technical", description: "14-day average directional index" },
  { id: "cci_20", name: "CCI 20", category: "technical", description: "20-day commodity channel index" },
  { id: "stochastic_k", name: "Stochastic %K", category: "technical", description: "Stochastic oscillator %K" },
  { id: "williams_r", name: "Williams %R", category: "technical", description: "Williams percent range" },
];

function seedFactors(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO quant_factors (id, name, category, description) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const f of FACTOR_SEEDS) {
      insert.run(f.id, f.name, f.category, f.description);
    }
  });
  tx();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuantFactor {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

export interface QuantStrategy {
  id: number;
  name: string;
  description: string | null;
  factors: string[];
  model_type: string;
  hyperparams: Record<string, unknown>;
  universe: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface QuantBacktestRun {
  id: number;
  strategy_id: number;
  strategy_snapshot: QuantStrategy | null;
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
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface QuantBacktestResult {
  id: number;
  run_id: number;
  total_return: number | null;
  annualized_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  total_trades: number | null;
  alpha: number | null;
  beta: number | null;
  benchmark_return: number | null;
  benchmark_curve: Array<{ date: string; value: number }> | null;
  equity_curve: Array<{ date: string; value: number }> | null;
  monthly_returns: Array<{ year: number; month: number; return: number }> | null;
  yearly_performance: Array<{
    year: number;
    strategy_return: number;
    benchmark_return: number | null;
    excess_return: number | null;
  }> | null;
  factor_importance: Record<string, number> | null;
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
}

export interface QuantTradeLogEntry {
  id: number;
  run_id: number;
  date: string;
  symbol: string;
  direction: string;
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Row converters
// ---------------------------------------------------------------------------

function toStrategy(row: Record<string, unknown>): QuantStrategy {
  return {
    ...row,
    factors: JSON.parse(row.factors as string),
    hyperparams: JSON.parse(row.hyperparams as string),
  } as QuantStrategy;
}

function parseStrategySnapshot(value: unknown): QuantStrategy | null {
  if (!value) return null;

  const snapshot = JSON.parse(value as string) as Partial<QuantStrategy>;
  if (typeof snapshot.id !== "number" || typeof snapshot.name !== "string") {
    return null;
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    description: snapshot.description ?? null,
    factors: Array.isArray(snapshot.factors) ? snapshot.factors : [],
    model_type: typeof snapshot.model_type === "string" ? snapshot.model_type : "linear_regression",
    hyperparams:
      snapshot.hyperparams && typeof snapshot.hyperparams === "object"
        ? snapshot.hyperparams
        : {},
    universe: typeof snapshot.universe === "string" ? snapshot.universe : "HS300",
    status: typeof snapshot.status === "string" ? snapshot.status : "ready",
    created_at: typeof snapshot.created_at === "string" ? snapshot.created_at : "",
    updated_at: typeof snapshot.updated_at === "string" ? snapshot.updated_at : "",
  };
}

function toBacktestRun(row: Record<string, unknown>): QuantBacktestRun {
  return {
    ...row,
    benchmark: normalizeBenchmarkCode(row.benchmark as string),
    config: JSON.parse(row.config as string),
    strategy_snapshot: parseStrategySnapshot(row.strategy_snapshot),
  } as QuantBacktestRun;
}

function toBacktestResult(row: Record<string, unknown>): QuantBacktestResult {
  return {
    ...row,
    benchmark_curve: row.benchmark_curve ? JSON.parse(row.benchmark_curve as string) : null,
    equity_curve: row.equity_curve ? JSON.parse(row.equity_curve as string) : null,
    monthly_returns: row.monthly_returns ? JSON.parse(row.monthly_returns as string) : null,
    yearly_performance: row.yearly_performance ? JSON.parse(row.yearly_performance as string) : null,
    factor_importance: row.factor_importance ? JSON.parse(row.factor_importance as string) : null,
    diagnostics: row.diagnostics ? JSON.parse(row.diagnostics as string) : null,
  } as QuantBacktestResult;
}

// ---------------------------------------------------------------------------
// Factor CRUD
// ---------------------------------------------------------------------------

export function listFactors(category?: string): QuantFactor[] {
  const db = getDb();
  if (category) {
    return db.prepare("SELECT * FROM quant_factors WHERE category = ? ORDER BY category, id").all(category) as QuantFactor[];
  }
  return db.prepare("SELECT * FROM quant_factors ORDER BY category, id").all() as QuantFactor[];
}

// ---------------------------------------------------------------------------
// Strategy CRUD
// ---------------------------------------------------------------------------

export function createStrategy(data: {
  name: string;
  description?: string;
  factors: string[];
  model_type: string;
  hyperparams?: Record<string, unknown>;
  universe?: string;
}): QuantStrategy {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO quant_strategies (name, description, factors, model_type, hyperparams, universe, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.description ?? null,
    JSON.stringify(data.factors),
    data.model_type,
    JSON.stringify(data.hyperparams ?? {}),
    data.universe ?? "HS300",
    "ready"
  );
  return getStrategy(Number(result.lastInsertRowid))!;
}

export function getStrategy(id: number): QuantStrategy | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quant_strategies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toStrategy(row) : null;
}

export function listStrategies(): QuantStrategy[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM quant_strategies ORDER BY updated_at DESC").all() as Record<string, unknown>[];
  return rows.map(toStrategy);
}

export function updateStrategy(id: number, data: {
  name?: string;
  description?: string;
  factors?: string[];
  model_type?: string;
  hyperparams?: Record<string, unknown>;
  universe?: string;
  status?: string;
}): QuantStrategy | null {
  const db = getDb();
  const existing = getStrategy(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE quant_strategies
    SET name = ?, description = ?, factors = ?, model_type = ?, hyperparams = ?,
        universe = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    JSON.stringify(data.factors ?? existing.factors),
    data.model_type ?? existing.model_type,
    JSON.stringify(data.hyperparams ?? existing.hyperparams),
    data.universe ?? existing.universe,
    data.status ?? existing.status,
    id
  );
  return getStrategy(id);
}

export function deleteStrategy(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM quant_strategies WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Backtest Run CRUD
// ---------------------------------------------------------------------------

export function createBacktestRun(data: {
  strategy_id: number;
  strategy_snapshot?: QuantStrategy | null;
  start_date: string;
  end_date: string;
  initial_capital?: number;
  benchmark?: string;
  rebalance_freq?: string;
  top_n?: number;
  commission?: number;
  config?: Record<string, unknown>;
}): QuantBacktestRun {
  const db = getDb();
  const benchmark = normalizeBenchmarkCode(data.benchmark);
  const result = db.prepare(`
    INSERT INTO quant_backtest_runs (
      strategy_id, strategy_snapshot, start_date, end_date, initial_capital, benchmark, rebalance_freq, top_n, commission, config
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.strategy_id,
    data.strategy_snapshot ? JSON.stringify(data.strategy_snapshot) : null,
    data.start_date,
    data.end_date,
    data.initial_capital ?? 1000000,
    benchmark,
    data.rebalance_freq ?? "weekly",
    data.top_n ?? 10,
    data.commission ?? 0.001,
    JSON.stringify(data.config ?? {})
  );
  return getBacktestRun(Number(result.lastInsertRowid))!;
}

export function getBacktestRun(id: number): QuantBacktestRun | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quant_backtest_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toBacktestRun(row) : null;
}

export function listBacktestRuns(strategyId?: number): QuantBacktestRun[] {
  const db = getDb();
  if (strategyId) {
    const rows = db.prepare("SELECT * FROM quant_backtest_runs WHERE strategy_id = ? ORDER BY created_at DESC").all(strategyId) as Record<string, unknown>[];
    return rows.map(toBacktestRun);
  }
  const rows = db.prepare("SELECT * FROM quant_backtest_runs ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(toBacktestRun);
}

export function updateBacktestRun(id: number, data: {
  status?: string;
  error_message?: string;
  completed_at?: string;
}): QuantBacktestRun | null {
  const db = getDb();
  const existing = getBacktestRun(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE quant_backtest_runs
    SET status = ?, error_message = ?, completed_at = ?
    WHERE id = ?
  `).run(
    data.status ?? existing.status,
    data.error_message ?? existing.error_message,
    data.completed_at ?? existing.completed_at,
    id
  );
  return getBacktestRun(id);
}

export function deleteBacktestRun(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM quant_backtest_runs WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Backtest Results & Trade Log (read-only from frontend)
// ---------------------------------------------------------------------------

export function getBacktestResults(runId: number): QuantBacktestResult | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quant_backtest_results WHERE run_id = ?").get(runId) as Record<string, unknown> | undefined;
  return row ? toBacktestResult(row) : null;
}

export function getTradeLog(runId: number): QuantTradeLogEntry[] {
  const db = getDb();
  return db.prepare("SELECT * FROM quant_trade_log WHERE run_id = ? ORDER BY date, id").all(runId) as QuantTradeLogEntry[];
}
