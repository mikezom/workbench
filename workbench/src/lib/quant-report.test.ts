import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { createBacktestRun, createStrategy, updateStrategy } from "./quant-db";
import { getBacktestDetail } from "./quant-report";

function insertBacktestResult(runId: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO quant_backtest_results (
      run_id, total_return, annualized_return, sharpe_ratio, max_drawdown,
      equity_curve, monthly_returns, factor_importance, diagnostics
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    0.12,
    0.08,
    1.1,
    -0.15,
    JSON.stringify([{ date: "2024-01-31", value: 1120000 }]),
    JSON.stringify([{ year: 2024, month: 1, return: 0.02 }]),
    JSON.stringify({ momentum_3m: 0.8 }),
    JSON.stringify({ rank_ic: [], score_dispersion: [], top_bottom_spread: [], grouped_return: [] })
  );
}

describe("quant backtest strategy snapshots", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM quant_trade_log");
    db.exec("DELETE FROM quant_backtest_results");
    db.exec("DELETE FROM quant_backtest_runs");
    db.exec("DELETE FROM quant_strategies");
  });

  it("uses the stored strategy snapshot when viewing results", () => {
    const strategy = createStrategy({
      name: "Original Strategy",
      description: "Initial version",
      factors: ["momentum_3m", "roe"],
      model_type: "linear_regression",
      hyperparams: { alpha: 0.1 },
      universe: "HS300",
    });

    const run = createBacktestRun({
      strategy_id: strategy.id,
      strategy_snapshot: strategy,
      start_date: "2024-01-01",
      end_date: "2024-12-31",
      config: { train_window_days: 180 },
    });
    insertBacktestResult(run.id);

    updateStrategy(strategy.id, {
      name: "Modified Strategy",
      description: "Changed after run",
      factors: ["pb_ratio"],
      model_type: "ridge",
      hyperparams: { alpha: 5 },
      universe: "ALL",
    });

    const detail = getBacktestDetail(run.id);

    expect(detail).not.toBeNull();
    expect(detail!.run.strategy_snapshot?.name).toBe("Original Strategy");
    expect(detail!.strategy?.name).toBe("Original Strategy");
    expect(detail!.strategy?.factors).toEqual(["momentum_3m", "roe"]);
    expect(detail!.strategy?.model_type).toBe("linear_regression");
    expect(detail!.strategy?.universe).toBe("HS300");
  });

  it("falls back to the live strategy for legacy runs without a snapshot", () => {
    const strategy = createStrategy({
      name: "Legacy Strategy",
      factors: ["momentum_6m"],
      model_type: "lasso",
    });

    const run = createBacktestRun({
      strategy_id: strategy.id,
      start_date: "2024-01-01",
      end_date: "2024-06-30",
    });
    insertBacktestResult(run.id);

    updateStrategy(strategy.id, {
      name: "Legacy Strategy Updated",
      factors: ["volatility_20d"],
      model_type: "random_forest",
      universe: "ZZ500",
    });

    const detail = getBacktestDetail(run.id);

    expect(detail).not.toBeNull();
    expect(detail!.run.strategy_snapshot).toBeNull();
    expect(detail!.strategy?.name).toBe("Legacy Strategy Updated");
    expect(detail!.strategy?.factors).toEqual(["volatility_20d"]);
    expect(detail!.strategy?.model_type).toBe("random_forest");
    expect(detail!.strategy?.universe).toBe("ZZ500");
  });
});
