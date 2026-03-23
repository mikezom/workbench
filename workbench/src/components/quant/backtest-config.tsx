"use client";

import { useState } from "react";
import { getDefaultBacktestDateRange } from "@/lib/quant-defaults";
import {
  DEFAULT_POSITION_CONTROL_CONFIG,
  type PositionControlConfig,
} from "@/lib/quant-backtest-config";

interface Strategy {
  id: number;
  name: string;
  model_type: string;
  factors: string[];
}

interface BacktestConfigProps {
  strategies: Strategy[];
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
}

export default function BacktestConfig({ strategies, onSubmit }: BacktestConfigProps) {
  const [defaultDateRange] = useState(getDefaultBacktestDateRange);
  const [strategyId, setStrategyId] = useState<number>(strategies[0]?.id ?? 0);
  const [startDate, setStartDate] = useState(defaultDateRange.startDate);
  const [endDate, setEndDate] = useState(defaultDateRange.endDate);
  const [initialCapital, setInitialCapital] = useState("1000000");
  const [benchmark, setBenchmark] = useState("000300.SH");
  const [rebalanceFreq, setRebalanceFreq] = useState("weekly");
  const [topN, setTopN] = useState("10");
  const [commission, setCommission] = useState("0.001");
  const [trainWindowDays, setTrainWindowDays] = useState("240");
  const [predictionHorizonDays, setPredictionHorizonDays] = useState("20");
  const [positionControlMode, setPositionControlMode] =
    useState<PositionControlConfig["mode"]>(DEFAULT_POSITION_CONTROL_CONFIG.mode);
  const [positionAtrPeriod, setPositionAtrPeriod] = useState(String(DEFAULT_POSITION_CONTROL_CONFIG.atr_period));
  const [positionRiskPerTrade, setPositionRiskPerTrade] = useState(String(DEFAULT_POSITION_CONTROL_CONFIG.risk_per_trade));
  const [positionStopAtrMultiple, setPositionStopAtrMultiple] = useState(
    String(DEFAULT_POSITION_CONTROL_CONFIG.stop_atr_multiple)
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strategyId) return;
    setSubmitting(true);
    onSubmit({
      strategy_id: strategyId,
      start_date: startDate,
      end_date: endDate,
      initial_capital: parseFloat(initialCapital),
      benchmark,
      rebalance_freq: rebalanceFreq,
      top_n: parseInt(topN),
      commission: parseFloat(commission),
      train_window_days: parseInt(trainWindowDays),
      prediction_horizon_days: parseInt(predictionHorizonDays),
      position_control: {
        mode: positionControlMode,
        atr_period: parseInt(positionAtrPeriod),
        risk_per_trade: parseFloat(positionRiskPerTrade),
        stop_atr_multiple: parseFloat(positionStopAtrMultiple),
      },
    });
    setTimeout(() => setSubmitting(false), 1000);
  };

  if (strategies.length === 0) {
    return (
      <div className="text-neutral-400 dark:text-neutral-500 text-center py-12 text-sm">
        Create a strategy first before running a backtest.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Strategy</label>
        <select
          value={strategyId}
          onChange={(e) => setStrategyId(Number(e.target.value))}
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.model_type}, {s.factors.length} factors)
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start Date</label>
          <input
            type="text"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
            placeholder="YYYYMMDD"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End Date</label>
          <input
            type="text"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
            placeholder="YYYYMMDD"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Initial Capital</label>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Benchmark</label>
          <input
            type="text"
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Rebalance</label>
          <select
            value={rebalanceFreq}
            onChange={(e) => setRebalanceFreq(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Top N Stocks</label>
          <input
            type="number"
            value={topN}
            onChange={(e) => setTopN(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Commission</label>
          <input
            type="number"
            step="0.0001"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Train Window (Days)</label>
          <input
            type="number"
            min="60"
            step="20"
            value={trainWindowDays}
            onChange={(e) => setTrainWindowDays(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Prediction Horizon (Days)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={predictionHorizonDays}
            onChange={(e) => setPredictionHorizonDays(e.target.value)}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          />
        </div>
      </div>

      <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-4">
        <div>
          <div className="text-sm font-medium">Position Control</div>
          <p className="text-xs text-neutral-500 mt-1">
            Choose how capital is distributed across selected names at each rebalance.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Sizing Rule</label>
          <select
            value={positionControlMode}
            onChange={(e) => setPositionControlMode(e.target.value as PositionControlConfig["mode"])}
            className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
          >
            <option value="equal_weight">Evenly Distributed</option>
            <option value="atr_inverse_volatility">ATR Inverse Volatility</option>
            <option value="atr_risk_budget">ATR Risk Budget</option>
          </select>
        </div>

        {positionControlMode !== "equal_weight" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ATR Period</label>
              <input
                type="number"
                min="2"
                step="1"
                value={positionAtrPeriod}
                onChange={(e) => setPositionAtrPeriod(e.target.value)}
                className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
            </div>

            {positionControlMode === "atr_risk_budget" ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Risk Per Trade</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={positionRiskPerTrade}
                    onChange={(e) => setPositionRiskPerTrade(e.target.value)}
                    className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Risk Stop Distance (ATR Multiple)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={positionStopAtrMultiple}
                    onChange={(e) => setPositionStopAtrMultiple(e.target.value)}
                    className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
                  />
                </div>
              </>
            ) : (
              <div className="col-span-1 text-xs text-neutral-500 self-end">
                Capital is weighted by the inverse of ATR percentage so lower-volatility names receive larger allocations.
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting || !strategyId}
        className="px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Starting..." : "Run Backtest"}
      </button>
    </form>
  );
}
