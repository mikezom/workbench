import { NextRequest, NextResponse } from "next/server";
import { getBacktestRun, getBacktestResults, getTradeLog, deleteBacktestRun } from "@/lib/quant-db";
import { getTushareDb } from "@/lib/tushare-db";

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

  // Resolve stock names from tushare.db
  const tsDb = getTushareDb();
  const nameMap: Record<string, string> = {};
  if (tsDb) {
    const symbols = [...new Set(trades.map((t: { symbol: string }) => t.symbol))];
    for (const sym of symbols) {
      const row = tsDb.prepare("SELECT name FROM stock_basic WHERE ts_code = ?").get(sym) as { name: string } | undefined;
      if (row) nameMap[sym] = row.name;
    }
  }
  const tradesWithName = trades.map((t: { symbol: string }) => ({
    ...t,
    name: nameMap[t.symbol] ?? "",
  }));

  return NextResponse.json({ run, results, trades: tradesWithName });
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
