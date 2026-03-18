import { NextRequest, NextResponse } from "next/server";
import { getBacktestRun, getBacktestResults, getTradeLog, deleteBacktestRun, getStrategy } from "@/lib/quant-db";
import { getTushareDb } from "@/lib/tushare-db";

type TradeLot = {
  quantity: number;
  price: number;
  commissionPerShare: number;
};

function withRealizedPnl(
  trades: Array<{
    id: number;
    symbol: string;
    direction: string;
    quantity: number;
    price: number;
    commission: number;
  }>,
): Array<{
  id: number;
  realized_pnl: number | null;
  realized_return: number | null;
}> {
  const inventory = new Map<string, TradeLot[]>();

  return trades.map((trade) => {
    if (trade.direction === "buy") {
      const lots = inventory.get(trade.symbol) ?? [];
      lots.push({
        quantity: trade.quantity,
        price: trade.price,
        commissionPerShare: trade.quantity > 0 ? trade.commission / trade.quantity : 0,
      });
      inventory.set(trade.symbol, lots);
      return { id: trade.id, realized_pnl: null, realized_return: null };
    }

    const lots = inventory.get(trade.symbol) ?? [];
    let remaining = trade.quantity;
    let costBasis = 0;
    let matchedQuantity = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.quantity);
      costBasis += matched * (lot.price + lot.commissionPerShare);
      lot.quantity -= matched;
      remaining -= matched;
      matchedQuantity += matched;
      if (lot.quantity === 0) lots.shift();
    }

    if (matchedQuantity === 0) {
      return { id: trade.id, realized_pnl: null, realized_return: null };
    }

    const sellCommission = trade.commission * (matchedQuantity / trade.quantity);
    const proceeds = matchedQuantity * trade.price - sellCommission;
    const realizedPnl = proceeds - costBasis;

    return {
      id: trade.id,
      realized_pnl: Number(realizedPnl.toFixed(2)),
      realized_return: costBasis > 0 ? Number((realizedPnl / costBasis).toFixed(4)) : null,
    };
  });
}

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
  const strategy = getStrategy(run.strategy_id);

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
  const tradePnL = new Map(withRealizedPnl(trades).map((trade) => [trade.id, trade]));
  const tradesWithName = trades.map((t: { id: number; symbol: string }) => ({
    ...t,
    name: nameMap[t.symbol] ?? "",
    realized_pnl: tradePnL.get(t.id)?.realized_pnl ?? null,
    realized_return: tradePnL.get(t.id)?.realized_return ?? null,
  }));

  return NextResponse.json({ run, strategy, results, trades: tradesWithName });
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
