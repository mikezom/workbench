import { NextRequest, NextResponse } from "next/server";
import { createBacktestRun, listBacktestRuns, getStrategy, updateStrategy } from "@/lib/quant-db";
import { spawn } from "child_process";
import path from "path";

export function GET(req: NextRequest) {
  const strategyId = req.nextUrl.searchParams.get("strategy_id");
  const runs = listBacktestRuns(strategyId ? Number(strategyId) : undefined);
  return NextResponse.json(runs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { strategy_id, start_date, end_date, initial_capital, benchmark, rebalance_freq, top_n, commission } = body;

  if (!strategy_id) {
    return NextResponse.json({ error: "strategy_id is required" }, { status: 400 });
  }

  const strategy = getStrategy(Number(strategy_id));
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }

  const run = createBacktestRun({
    strategy_id: Number(strategy_id),
    start_date: start_date ?? "20210101",
    end_date: end_date ?? "20241231",
    initial_capital,
    benchmark,
    rebalance_freq,
    top_n,
    commission,
  });

  // Update strategy status
  updateStrategy(strategy.id, { status: "backtesting" });

  // Spawn backtest subprocess
  const scriptPath = path.join(process.cwd(), "scripts", "quant_backtest.py");
  try {
    const child = spawn("python3", [scriptPath, "--run-id", String(run.id)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to start backtest: ${err}` },
      { status: 500 }
    );
  }

  return NextResponse.json(run, { status: 201 });
}
