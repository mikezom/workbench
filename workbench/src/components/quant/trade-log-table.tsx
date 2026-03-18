"use client";

import { useMemo, useState } from "react";

interface Trade {
  id: number;
  date: string;
  symbol: string;
  name: string;
  direction: string;
  quantity: number;
  price: number;
  amount: number;
  commission: number;
  reason: string | null;
}

interface TradeLogTableProps {
  trades: Trade[];
}

type TradeDirectionFilter = "all" | "buy" | "sell";

export function filterTrades(
  trades: Trade[],
  filters: { query: string; direction: TradeDirectionFilter }
): Trade[] {
  const query = filters.query.trim().toLowerCase();

  return trades.filter((trade) => {
    if (filters.direction !== "all" && trade.direction !== filters.direction) {
      return false;
    }

    if (!query) return true;

    return [
      trade.date,
      trade.symbol,
      trade.name,
      trade.reason ?? "",
    ].some((value) => value.toLowerCase().includes(query));
  });
}

export default function TradeLogTable({ trades }: TradeLogTableProps) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<TradeDirectionFilter>("all");

  const filteredTrades = useMemo(
    () => filterTrades(trades, { query, direction }),
    [trades, query, direction]
  );

  if (!trades || trades.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No trades</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by symbol, name, date, or reason"
            className="w-72 max-w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800"
          />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as TradeDirectionFilter)}
            className="border border-neutral-300 dark:border-neutral-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-neutral-800"
          >
            <option value="all">All trades</option>
            <option value="buy">Buys only</option>
            <option value="sell">Sells only</option>
          </select>
        </div>
        <div className="text-xs text-neutral-500">
          Showing {filteredTrades.length} of {trades.length}
        </div>
      </div>

      <div className="max-h-96 overflow-auto custom-scrollbar border border-neutral-200 dark:border-neutral-700 rounded">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
            <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
              <th className="py-2 px-3 font-medium">Date</th>
              <th className="py-2 px-3 font-medium">Symbol</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium">Direction</th>
              <th className="py-2 px-3 font-medium text-right">Qty</th>
              <th className="py-2 px-3 font-medium text-right">Price</th>
              <th className="py-2 px-3 font-medium text-right">Amount</th>
              <th className="py-2 px-3 font-medium text-right">Comm.</th>
              <th className="py-2 px-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrades.map((t) => (
              <tr
                key={t.id}
                className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <td className="py-1.5 px-3 font-mono text-xs">{t.date}</td>
                <td className="py-1.5 px-3">{t.symbol}</td>
                <td className="py-1.5 px-3 text-neutral-500 text-xs">{t.name}</td>
                <td className="py-1.5 px-3">
                  <span
                    className={
                      t.direction === "buy"
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }
                  >
                    {t.direction.toUpperCase()}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right font-mono">{t.quantity.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right font-mono">{t.price.toFixed(2)}</td>
                <td className="py-1.5 px-3 text-right font-mono">{t.amount.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right font-mono text-neutral-400">{t.commission.toFixed(2)}</td>
                <td className="py-1.5 px-3 text-neutral-500 text-xs">{t.reason ?? ""}</td>
              </tr>
            ))}
            {filteredTrades.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-neutral-400">
                  No matching trades
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
