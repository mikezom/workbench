import type Database from "better-sqlite3";
import { getDb } from "./db";

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
        CHECK (universe IN ('HS300', 'ZZ500', 'ZZ1000')),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'backtesting', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quant_backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL REFERENCES quant_strategies(id) ON DELETE CASCADE,
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
      factor_importance TEXT,
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
}

function migrateQuantSchema(db: Database.Database): void {
  const resultColumns = db.prepare("PRAGMA table_info(quant_backtest_results)").all() as Array<{ name: string }>;
  const hasBenchmarkCurve = resultColumns.some((column) => column.name === "benchmark_curve");

  if (!hasBenchmarkCurve) {
    db.exec("ALTER TABLE quant_backtest_results ADD COLUMN benchmark_curve TEXT");
  }
}

// ---------------------------------------------------------------------------
// Factor seed data
// ---------------------------------------------------------------------------

const FACTOR_SEEDS: Array<{ id: string; name: string; category: string; description: string }> = [
  // Price (10)
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
  // Volume (5)
  { id: "volume_ratio_5d", name: "Volume Ratio 5D", category: "volume", description: "5-day volume ratio vs 20-day average" },
  { id: "volume_ratio_20d", name: "Volume Ratio 20D", category: "volume", description: "20-day volume ratio vs 60-day average" },
  { id: "obv_slope", name: "OBV Slope", category: "volume", description: "On-balance volume trend slope" },
  { id: "vwap_deviation", name: "VWAP Deviation", category: "volume", description: "Deviation from volume-weighted average price" },
  { id: "turnover_rate", name: "Turnover Rate", category: "volume", description: "Daily turnover rate" },
  // Fundamental (10)
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
  // Technical (8)
  { id: "rsi_14", name: "RSI 14", category: "technical", description: "14-day relative strength index" },
  { id: "macd_signal", name: "MACD Signal", category: "technical", description: "MACD signal line crossover" },
  { id: "bollinger_position", name: "Bollinger Position", category: "technical", description: "Position within Bollinger Bands" },
  { id: "atr_14", name: "ATR 14", category: "technical", description: "14-day average true range" },
  { id: "adx_14", name: "ADX 14", category: "technical", description: "14-day average directional index" },
  { id: "cci_20", name: "CCI 20", category: "technical", description: "20-day commodity channel index" },
  { id: "stochastic_k", name: "Stochastic %K", category: "technical", description: "Stochastic oscillator %K" },
  { id: "williams_r", name: "Williams %R", category: "technical", description: "Williams percent range" },
];

function seedFactors(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM quant_factors").get() as { cnt: number };
  if (count.cnt > 0) return;

  const insert = db.prepare(
    "INSERT INTO quant_factors (id, name, category, description) VALUES (?, ?, ?, ?)"
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
  status: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  benchmark: string;
  rebalance_freq: string;
  top_n: number;
  commission: number;
  config: Record<string, unknown>;
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
  factor_importance: Record<string, number> | null;
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

function toBacktestRun(row: Record<string, unknown>): QuantBacktestRun {
  return {
    ...row,
    config: JSON.parse(row.config as string),
  } as QuantBacktestRun;
}

function toBacktestResult(row: Record<string, unknown>): QuantBacktestResult {
  return {
    ...row,
    benchmark_curve: row.benchmark_curve ? JSON.parse(row.benchmark_curve as string) : null,
    equity_curve: row.equity_curve ? JSON.parse(row.equity_curve as string) : null,
    monthly_returns: row.monthly_returns ? JSON.parse(row.monthly_returns as string) : null,
    factor_importance: row.factor_importance ? JSON.parse(row.factor_importance as string) : null,
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
    INSERT INTO quant_strategies (name, description, factors, model_type, hyperparams, universe)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.description ?? null,
    JSON.stringify(data.factors),
    data.model_type,
    JSON.stringify(data.hyperparams ?? {}),
    data.universe ?? "HS300"
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
  const result = db.prepare(`
    INSERT INTO quant_backtest_runs (strategy_id, start_date, end_date, initial_capital, benchmark, rebalance_freq, top_n, commission, config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.strategy_id,
    data.start_date,
    data.end_date,
    data.initial_capital ?? 1000000,
    data.benchmark ?? "000300.SH",
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
