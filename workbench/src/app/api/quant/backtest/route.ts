import { NextRequest, NextResponse } from "next/server";
import { createBacktestRun, listBacktestRuns, getStrategy, updateStrategy } from "@/lib/quant-db";
import { getDefaultBacktestDateRange } from "@/lib/quant-defaults";
import { spawn } from "child_process";
import path from "path";

export function GET(req: NextRequest) {
  const strategyId = req.nextUrl.searchParams.get("strategy_id");
  const runs = listBacktestRuns(strategyId ? Number(strategyId) : undefined);
  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    strategy_id,
    start_date,
    end_date,
    initial_capital,
    benchmark,
    rebalance_freq,
    top_n,
    commission,
    train_window_days,
    prediction_horizon_days,
  } = body;

  if (!strategy_id) {
    return NextResponse.json({ error: "strategy_id is required" }, { status: 400 });
  }

  const defaultDateRange = getDefaultBacktestDateRange();

  const strategy = getStrategy(Number(strategy_id));
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const run = createBacktestRun({
    strategy_id: Number(strategy_id),
    strategy_snapshot: strategy,
    start_date: start_date ?? defaultDateRange.startDate,
    end_date: end_date ?? defaultDateRange.endDate,
    initial_capital,
    benchmark,
    rebalance_freq,
    top_n,
    commission,
    config: {
      train_window_days,
      prediction_horizon_days,
    },
  });

  // Update strategy status
  updateStrategy(strategy.id, { status: "backtesting" });

  // Spawn backtest subprocess
  const scriptPath = path.join(process.cwd(), "scripts", "quant_backtest.py");
  const pythonPath = path.join(process.cwd(), ".venv", "bin", "python");
  try {
    const child = spawn(pythonPath, [scriptPath, "--run-id", String(run.id)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    updateStrategy(strategy.id, { status: "ready" });
    return NextResponse.json(
      { error: `Failed to start backtest: ${err}` },
      { status: 500 }
    );
  }

  return NextResponse.json(run, { status: 201 });
}
