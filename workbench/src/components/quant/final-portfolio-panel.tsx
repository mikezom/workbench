"use client";

import { useEffect, useMemo, useState } from "react";
import {
  allocateCapitalByFinalPortfolio,
  deriveFinalPortfolioHoldings,
  type FinalPortfolioTrade,
} from "@/lib/quant-final-portfolio";

interface FinalPortfolioPanelProps {
  trades: FinalPortfolioTrade[];
  defaultCapital: number;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function FinalPortfolioPanel({ trades, defaultCapital }: FinalPortfolioPanelProps) {
  const [capitalInput, setCapitalInput] = useState(String(Math.round(defaultCapital)));

  useEffect(() => {
    setCapitalInput(String(Math.round(defaultCapital)));
  }, [defaultCapital]);

  const holdings = useMemo(() => deriveFinalPortfolioHoldings(trades), [trades]);
  const capital = Number(capitalInput);
  const hasCapital = Number.isFinite(capital) && capital > 0;
  const allocation = useMemo(
    () => allocateCapitalByFinalPortfolio(holdings, hasCapital ? capital : 0),
    [holdings, capital, hasCapital]
  );

  if (holdings.length === 0) {
    return (
      <div className="text-neutral-400 dark:text-neutral-500 text-center py-12 text-sm border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg">
        No open positions remain in the final portfolio for this run.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Final Holdings Snapshot</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Inferred from the trade log. Portfolio weights use each asset&apos;s most recent trade price as a proxy.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <SummaryCard label="Assets" value={String(holdings.length)} />
            <SummaryCard label="Final Shares" value={holdings.reduce((sum, row) => sum + row.finalQuantity, 0).toLocaleString()} />
            <SummaryCard label="Est. Value" value={`RMB ${formatCurrency(allocation.totalMarketValue)}`} />
            <SummaryCard label="Largest Weight" value={formatPercent(holdings[0]?.weight ?? 0)} />
          </div>
        </div>

        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Quick Calculation</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Enter your capital in RMB to estimate target share counts at the same final portfolio weights.
            </p>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-400">Capital (RMB)</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={capitalInput}
              onChange={(event) => setCapitalInput(event.target.value)}
              className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              placeholder="1000000"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <SummaryCard label="Target Capital" value={hasCapital ? `RMB ${formatCurrency(capital)}` : "—"} />
            <SummaryCard label="Deployable" value={hasCapital ? `RMB ${formatCurrency(allocation.totalAllocatedValue)}` : "—"} />
            <SummaryCard label="Cash Left" value={hasCapital ? `RMB ${formatCurrency(allocation.residualCash)}` : "—"} />
            <SummaryCard
              label="Capital Used"
              value={hasCapital && capital > 0 ? formatPercent(allocation.totalAllocatedValue / capital) : "—"}
            />
          </div>
        </div>
      </div>

      <div className="overflow-auto custom-scrollbar border border-neutral-200 dark:border-neutral-700 rounded">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
              <th className="py-2 px-3 font-medium">Rank</th>
              <th className="py-2 px-3 font-medium">Symbol</th>
              <th className="py-2 px-3 font-medium">Name</th>
              <th className="py-2 px-3 font-medium text-right">Final Qty</th>
              <th className="py-2 px-3 font-medium text-right">Last Price</th>
              <th className="py-2 px-3 font-medium text-right">Est. Weight</th>
              <th className="py-2 px-3 font-medium text-right">Est. Value</th>
              <th className="py-2 px-3 font-medium text-right">Target Value</th>
              <th className="py-2 px-3 font-medium text-right">Target Qty</th>
              <th className="py-2 px-3 font-medium">Last Trade Date</th>
            </tr>
          </thead>
          <tbody>
            {allocation.rows.map((row, index) => (
              <tr
                key={row.symbol}
                className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <td className="py-2 px-3 font-mono">{index + 1}</td>
                <td className="py-2 px-3 font-medium">{row.symbol}</td>
                <td className="py-2 px-3 text-neutral-500">{row.name || "—"}</td>
                <td className="py-2 px-3 text-right font-mono">{row.finalQuantity.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-mono">{formatCurrency(row.lastTradePrice)}</td>
                <td className="py-2 px-3 text-right font-mono">{formatPercent(row.weight)}</td>
                <td className="py-2 px-3 text-right font-mono">RMB {formatCurrency(row.marketValue)}</td>
                <td className="py-2 px-3 text-right font-mono">{hasCapital ? `RMB ${formatCurrency(row.targetValue)}` : "—"}</td>
                <td className="py-2 px-3 text-right font-mono">{hasCapital ? row.targetQuantity.toLocaleString() : "—"}</td>
                <td className="py-2 px-3 font-mono text-xs text-neutral-500">{row.lastTradeDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-sm mt-1 break-words">{value}</div>
    </div>
  );
}
