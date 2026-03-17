import { NextRequest, NextResponse } from "next/server";
import { getBacktestRun, getBacktestResults, getTradeLog, deleteBacktestRun } from "@/lib/quant-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = getBacktestRun(Number(params.id));
  if (!run) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }

  const results = getBacktestResults(run.id);
  const trades = getTradeLog(run.id);

  return NextResponse.json({ run, results, trades });
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteBacktestRun(Number(params.id));
  if (!deleted) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
