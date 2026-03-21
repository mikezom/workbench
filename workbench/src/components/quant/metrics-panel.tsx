"use client";

interface MetricsPanelProps {
  totalReturn: number | null;
  annualizedReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  totalTrades: number | null;
  alpha: number | null;
  beta: number | null;
  compact?: boolean;
}

function MetricCard({ label, value, format, positiveGood = true, compact = false }: {
  label: string;
  value: number | null;
  format: "percent" | "number" | "ratio";
  positiveGood?: boolean;
  compact?: boolean;
}) {
  const paddingClass = compact ? "p-2.5" : "p-3";
  const labelClass = compact ? "text-[11px]" : "text-xs";
  const valueClass = compact ? "text-base" : "text-lg";

  if (value === null || value === undefined) {
    return (
      <div className={`border border-neutral-200 dark:border-neutral-700 rounded ${paddingClass}`}>
        <div className={`${labelClass} text-neutral-400`}>{label}</div>
        <div className={`${valueClass} font-mono mt-1`}>—</div>
      </div>
    );
  }

  let display: string;
  if (format === "percent") {
    display = `${(value * 100).toFixed(2)}%`;
  } else if (format === "ratio") {
    display = value.toFixed(2);
  } else {
    display = value.toLocaleString();
  }

  const isPositive = value > 0;
  const colorClass = positiveGood
    ? isPositive
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400"
    : "";

  return (
    <div className={`border border-neutral-200 dark:border-neutral-700 rounded ${paddingClass}`}>
      <div className={`${labelClass} text-neutral-400`}>{label}</div>
      <div className={`${valueClass} font-mono mt-1 ${colorClass}`}>{display}</div>
    </div>
  );
}

export default function MetricsPanel(props: MetricsPanelProps) {
  return (
    <div className={`grid gap-2.5 ${props.compact ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-3 portrait:grid-cols-2"}`}>
      <MetricCard label="Total Return" value={props.totalReturn} format="percent" compact={props.compact} />
      <MetricCard label="Annualized Return" value={props.annualizedReturn} format="percent" compact={props.compact} />
      <MetricCard label="Sharpe Ratio" value={props.sharpeRatio} format="ratio" compact={props.compact} />
      <MetricCard label="Max Drawdown" value={props.maxDrawdown} format="percent" positiveGood={false} compact={props.compact} />
      <MetricCard label="Win Rate" value={props.winRate} format="percent" compact={props.compact} />
      <MetricCard label="Profit Factor" value={props.profitFactor} format="ratio" compact={props.compact} />
      <MetricCard label="Total Trades" value={props.totalTrades} format="number" positiveGood={false} compact={props.compact} />
      <MetricCard label="Alpha" value={props.alpha} format="percent" compact={props.compact} />
      <MetricCard label="Beta" value={props.beta} format="ratio" positiveGood={false} compact={props.compact} />
    </div>
  );
}
