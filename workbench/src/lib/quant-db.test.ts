import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import {
  createBacktestRun,
  createStrategy,
  getBacktestRun,
  listFactors,
  updateBacktestRun,
} from "./quant-db";

describe("quant factor registry", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM quant_trade_log");
    db.exec("DELETE FROM quant_backtest_results");
    db.exec("DELETE FROM quant_backtest_runs");
    db.exec("DELETE FROM quant_strategies");
  });

  it("seeds the expanded cached factor set", () => {
    const factors = listFactors();
    const ids = factors.map((factor) => factor.id);

    expect(factors).toHaveLength(81);
    expect(ids).toEqual(
      expect.arrayContaining([
        "earnings_yield_ttm",
        "sales_yield_ttm",
        "dividend_yield_ttm",
        "free_float_turnover",
        "market_volume_ratio",
        "float_market_cap",
        "free_float_ratio",
        "circulating_cap_ratio",
        "grossprofit_margin",
        "netprofit_margin",
        "current_ratio",
        "quick_ratio",
        "operating_revenue_yoy",
        "limit_up_gap",
        "limit_down_gap",
        "limit_hit_20d",
        "beta_60d",
        "residual_vol_60d",
        "relative_strength_vs_benchmark",
        "listing_age",
        "net_mf_amount_ratio",
        "large_order_net_ratio",
        "extra_large_order_imbalance",
        "margin_balance_to_float_mv",
        "financing_buy_shock",
        "short_pressure",
        "adjusted_momentum_3m",
        "adjusted_momentum_6m",
        "adjusted_ret_20d",
        "adjusted_mean_reversion_20d",
        "top_list_flag",
        "top_list_net_buy_ratio",
        "northbound_holding_ratio",
        "northbound_holding_change_20d",
        "insider_accumulation",
        "ownership_concentration",
      ])
    );

    expect(listFactors("price")).toHaveLength(29);
    expect(listFactors("volume")).toHaveLength(16);
    expect(listFactors("fundamental")).toHaveLength(26);
    expect(listFactors("technical")).toHaveLength(10);
  });

  it("stores and updates bookmark state on backtest runs", () => {
    const strategy = createStrategy({
      name: "Bookmark Test",
      factors: ["momentum_3m"],
      model_type: "linear_regression",
    });

    const run = createBacktestRun({
      strategy_id: strategy.id,
      start_date: "20240101",
      end_date: "20241231",
    });

    expect(run.bookmarked).toBe(false);

    const updated = updateBacktestRun(run.id, { bookmarked: true });
    expect(updated?.bookmarked).toBe(true);
    expect(getBacktestRun(run.id)?.bookmarked).toBe(true);
  });

  it("normalizes nested backtest config for position sizing defaults and overrides", () => {
    const strategy = createStrategy({
      name: "Position Control Test",
      factors: ["momentum_3m"],
      model_type: "linear_regression",
    });

    const run = createBacktestRun({
      strategy_id: strategy.id,
      start_date: "20240101",
      end_date: "20241231",
      config: {
        train_window_days: 180,
        position_control: {
          mode: "atr_risk_budget",
          atr_period: 20,
          risk_per_trade: 0.015,
          stop_atr_multiple: 2.5,
        },
        trailing_stop: {
          enabled: true,
          atr_period: 10,
          atr_multiple: 2.2,
          slippage: 0.003,
        },
      },
    });

    expect(run.config.train_window_days).toBe(180);
    expect(run.config.prediction_horizon_days).toBe(20);
    expect(run.config.position_control).toEqual({
      mode: "atr_risk_budget",
      atr_period: 20,
      risk_per_trade: 0.015,
      stop_atr_multiple: 2.5,
    });
    expect(run.config.trailing_stop).toEqual({
      enabled: true,
      atr_period: 10,
      atr_multiple: 2.2,
      slippage: 0.003,
    });
  });
});
