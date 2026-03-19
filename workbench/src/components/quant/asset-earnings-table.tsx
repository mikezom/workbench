"use client";

import { useMemo } from "react";

interface Trade {
  symbol: string;
  name: string;
  direction: string;
  amount: number;
  realized_pnl: number | null;
  realized_return: number | null;
}

interface AssetEarningsTableProps {
  trades: Trade[];
}

interface AssetRow {
  symbol: string;
  name: string;
  realized_pnl: number;
  avg_realized_return: number | null;
  exit_count: number;
  win_count: number;
  gross_turnover: number;
}

function formatPct(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(2)}%`;
}

export default function AssetEarningsTable({ trades }: AssetEarningsTableProps) {
  const rows = useMemo(() => {
    const byAsset = new Map<string, AssetRow & { return_sum: number; return_count: number }>();

    for (const trade of trades) {
      if (trade.direction !== "sell" || trade.realized_pnl == null) continue;

      const existing = byAsset.get(trade.symbol) ?? {
        symbol: trade.symbol,
        name: trade.name,
        realized_pnl: 0,
        avg_realized_return: null,
        exit_count: 0,
        win_count: 0,
        gross_turnover: 0,
        return_sum: 0,
        return_count: 0,
      };

      existing.realized_pnl += trade.realized_pnl;
      existing.exit_count += 1;
      existing.gross_turnover += trade.amount;
      if (trade.realized_pnl > 0) existing.win_count += 1;
      if (trade.realized_return != null) {
        existing.return_sum += trade.realized_return;
        existing.return_count += 1;
      }
      if (!existing.name && trade.name) existing.name = trade.name;
      byAsset.set(trade.symbol, existing);
    }

    return Array.from(byAsset.values())
      .map((row) => ({
        symbol: row.symbol,
        name: row.name,
        realized_pnl: row.realized_pnl,
        avg_realized_return: row.return_count > 0 ? row.return_sum / row.return_count : null,
        exit_count: row.exit_count,
        win_count: row.win_count,
        gross_turnover: row.gross_turnover,
      }))
      .sort((a, b) => b.realized_pnl - a.realized_pnl);
  }, [trades]);

  if (rows.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No realized asset earnings yet</div>;
  }

  return (
    <div className="overflow-auto custom-scrollbar border border-neutral-200 dark:border-neutral-700 rounded">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
            <th className="py-2 px-3 font-medium">Rank</th>
            <th className="py-2 px-3 font-medium">Symbol</th>
            <th className="py-2 px-3 font-medium">Name</th>
            <th className="py-2 px-3 font-medium text-right">Realized P/L</th>
            <th className="py-2 px-3 font-medium text-right">Avg Exit Return</th>
            <th className="py-2 px-3 font-medium text-right">Winning Exits</th>
            <th className="py-2 px-3 font-medium text-right">Total Exits</th>
            <th className="py-2 px-3 font-medium text-right">Turnover</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.symbol}
              className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <td className="py-2 px-3 font-mono">{index + 1}</td>
              <td className="py-2 px-3 font-medium">{row.symbol}</td>
              <td className="py-2 px-3 text-neutral-500">{row.name || "—"}</td>
              <td
                className={`py-2 px-3 text-right font-mono ${
                  row.realized_pnl >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {row.realized_pnl.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
              </td>
              <td className="py-2 px-3 text-right font-mono">{formatPct(row.avg_realized_return)}</td>
              <td className="py-2 px-3 text-right font-mono">{row.win_count}</td>
              <td className="py-2 px-3 text-right font-mono">{row.exit_count}</td>
              <td className="py-2 px-3 text-right font-mono">
                {row.gross_turnover.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
