"use client";

interface YearlyRow {
  year: number;
  strategy_return: number;
  benchmark_return: number | null;
  excess_return: number | null;
}

interface YearlyPerformanceTableProps {
  rows: YearlyRow[];
}

function formatPct(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(2)}%`;
}

export default function YearlyPerformanceTable({ rows }: YearlyPerformanceTableProps) {
  if (!rows || rows.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No yearly performance data</div>;
  }

  return (
    <div className="overflow-auto custom-scrollbar border border-neutral-200 dark:border-neutral-700 rounded">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr className="border-b border-neutral-200 dark:border-neutral-700 text-left">
            <th className="py-2 px-3 font-medium">Year</th>
            <th className="py-2 px-3 font-medium text-right">Strategy</th>
            <th className="py-2 px-3 font-medium text-right">Benchmark</th>
            <th className="py-2 px-3 font-medium text-right">Excess</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.year}
              className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <td className="py-2 px-3 font-mono">{row.year}</td>
              <td className="py-2 px-3 text-right font-mono">{formatPct(row.strategy_return)}</td>
              <td className="py-2 px-3 text-right font-mono text-neutral-500">{formatPct(row.benchmark_return)}</td>
              <td
                className={`py-2 px-3 text-right font-mono ${
                  row.excess_return == null
                    ? "text-neutral-400"
                    : row.excess_return >= 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatPct(row.excess_return)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
