import {
  getBacktestRun,
  getBacktestResults,
  getTradeLog,
  getStrategy,
  type QuantBacktestResult,
  type QuantBacktestRun,
  type QuantStrategy,
  type QuantTradeLogEntry,
} from "@/lib/quant-db";
import { getTushareDb } from "@/lib/tushare-db";

type TradeLot = {
  quantity: number;
  price: number;
  commissionPerShare: number;
};

export type QuantTradeReportEntry = QuantTradeLogEntry & {
  name: string;
  realized_pnl: number | null;
  realized_return: number | null;
};

export type QuantBacktestDetail = {
  run: QuantBacktestRun;
  strategy: QuantStrategy | null;
  results: QuantBacktestResult | null;
  trades: QuantTradeReportEntry[];
};

function withRealizedPnl(trades: QuantTradeLogEntry[]): Array<{
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
    let matchedQuantity = 0;
    let costBasis = 0;

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

export function getBacktestDetail(runId: number): QuantBacktestDetail | null {
  const run = getBacktestRun(runId);
  if (!run) return null;

  const results = getBacktestResults(run.id);
  const trades = getTradeLog(run.id);
  const strategy = run.strategy_snapshot ?? getStrategy(run.strategy_id);

  const tsDb = getTushareDb();
  const nameMap: Record<string, string> = {};
  if (tsDb) {
    const symbols = Array.from(new Set(trades.map((trade) => trade.symbol)));
    for (const symbol of symbols) {
      const row = tsDb.prepare("SELECT name FROM stock_basic WHERE ts_code = ?").get(symbol) as { name: string } | undefined;
      if (row) nameMap[symbol] = row.name;
    }
  }

  const tradePnL = new Map(withRealizedPnl(trades).map((trade) => [trade.id, trade]));
  const enrichedTrades = trades.map((trade) => ({
    ...trade,
    name: nameMap[trade.symbol] ?? "",
    realized_pnl: tradePnL.get(trade.id)?.realized_pnl ?? null,
    realized_return: tradePnL.get(trade.id)?.realized_return ?? null,
  }));

  return { run, strategy, results, trades: enrichedTrades };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? "--" : `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value == null ? "--" : Number(value).toFixed(digits);
}

function formatCurrency(value: number | null | undefined): string {
  return value == null ? "--" : value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function renderEquityChart(detail: QuantBacktestDetail): string {
  const equity = detail.results?.equity_curve ?? [];
  if (equity.length === 0) return "<div class=\"empty\">No equity data</div>";

  const width = 760;
  const height = 260;
  const padding = 20;
  const equityValues = equity.map((point) => point.value);
  const benchmarkValues = detail.results?.benchmark_curve?.map((point) => point.value) ?? [];
  const combined = benchmarkValues.length > 0 ? equityValues.concat(benchmarkValues) : equityValues;
  const min = Math.min(...combined);
  const max = Math.max(...combined);
  const range = max - min || 1;
  const scalePath = (values: number[]) => values.map((value, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="Equity curve">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      <path d="${scalePath(equityValues)}" fill="none" stroke="#0f766e" stroke-width="3" />
      ${benchmarkValues.length > 0 ? `<path d="${scalePath(benchmarkValues)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />` : ""}
    </svg>
  `;
}

export function buildBacktestReportHtml(detail: QuantBacktestDetail): string {
  const title = detail.strategy?.name ?? `Backtest #${detail.run.id}`;
  const factors = detail.strategy?.factors ?? [];
  const factorRows = Object.entries(detail.results?.factor_importance ?? {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([name, value]) => `
      <tr><td>${escapeHtml(name)}</td><td class="num">${formatNumber(value, 4)}</td></tr>
    `)
    .join("");

  const yearlyRows = (detail.results?.yearly_performance ?? [])
    .map((row) => `
      <tr>
        <td>${row.year}</td>
        <td class="num">${formatPercent(row.strategy_return)}</td>
        <td class="num">${formatPercent(row.benchmark_return)}</td>
        <td class="num">${formatPercent(row.excess_return)}</td>
      </tr>
    `)
    .join("");

  const groupedReturnRows = (detail.results?.diagnostics?.grouped_return ?? [])
    .map((row) => `<tr><td>${escapeHtml(row.bucket)}</td><td class="num">${formatPercent(row.avg_return)}</td></tr>`)
    .join("");

  const tradeRows = detail.trades.map((trade) => `
    <tr>
      <td>${escapeHtml(trade.date)}</td>
      <td>${escapeHtml(trade.symbol)}</td>
      <td>${escapeHtml(trade.name)}</td>
      <td>${escapeHtml(trade.direction.toUpperCase())}</td>
      <td class="num">${trade.quantity.toLocaleString()}</td>
      <td class="num">${formatNumber(trade.price)}</td>
      <td class="num">${formatCurrency(trade.amount)}</td>
      <td class="num">${formatCurrency(trade.commission)}</td>
      <td class="num">${formatCurrency(trade.realized_pnl)}</td>
      <td class="num">${formatPercent(trade.realized_return)}</td>
    </tr>
  `).join("");

  const diagnostics = detail.results?.diagnostics;
  const avgRankIc = diagnostics?.rank_ic.length
    ? diagnostics.rank_ic.reduce((sum, point) => sum + point.value, 0) / diagnostics.rank_ic.length
    : null;
  const avgSpread = diagnostics?.top_bottom_spread.length
    ? diagnostics.top_bottom_spread.reduce((sum, point) => sum + point.value, 0) / diagnostics.top_bottom_spread.length
    : null;
  const lastDispersion = diagnostics?.score_dispersion.at(-1) ?? null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} Report</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f5; color: #18181b; }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 56px; }
    .hero { background: linear-gradient(135deg, #0f766e, #1d4ed8); color: white; border-radius: 18px; padding: 24px; margin-bottom: 20px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; opacity: 0.9; }
    .grid { display: grid; gap: 12px; }
    .grid.meta { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: 18px; }
    .card { background: white; border: 1px solid #e4e4e7; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05); }
    .metric { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .metric .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .eyebrow { color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #e4e4e7; text-align: left; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .two-col { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; margin-top: 20px; }
    .three-col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
    .chart { width: 100%; height: auto; border-radius: 10px; }
    .empty { color: #71717a; padding: 24px 0; }
    @media (max-width: 900px) { .two-col, .three-col { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail.run.start_date)} to ${escapeHtml(detail.run.end_date)}</p>
      <div class="grid meta">
        <div><div class="eyebrow">Model</div><div>${escapeHtml(detail.strategy?.model_type ?? "--")}</div></div>
        <div><div class="eyebrow">Universe</div><div>${escapeHtml(detail.strategy?.universe ?? "--")}</div></div>
        <div><div class="eyebrow">Benchmark</div><div>${escapeHtml(detail.run.benchmark)}</div></div>
        <div><div class="eyebrow">Rebalance</div><div>${escapeHtml(detail.run.rebalance_freq)}</div></div>
        <div><div class="eyebrow">Train Window</div><div>${escapeHtml(String(detail.run.config.train_window_days ?? 240))} days</div></div>
        <div><div class="eyebrow">Prediction Horizon</div><div>${escapeHtml(String(detail.run.config.prediction_horizon_days ?? 20))} days</div></div>
        <div><div class="eyebrow">Top N</div><div>${escapeHtml(String(detail.run.top_n))}</div></div>
        <div><div class="eyebrow">Factors</div><div>${escapeHtml(String(factors.length))}</div></div>
      </div>
    </section>

    <section class="metric">
      <div class="card"><div class="eyebrow">Total Return</div><div class="value">${formatPercent(detail.results?.total_return)}</div></div>
      <div class="card"><div class="eyebrow">Annualized</div><div class="value">${formatPercent(detail.results?.annualized_return)}</div></div>
      <div class="card"><div class="eyebrow">Sharpe</div><div class="value">${formatNumber(detail.results?.sharpe_ratio)}</div></div>
      <div class="card"><div class="eyebrow">Max Drawdown</div><div class="value">${formatPercent(detail.results?.max_drawdown)}</div></div>
      <div class="card"><div class="eyebrow">Win Rate</div><div class="value">${formatPercent(detail.results?.win_rate)}</div></div>
      <div class="card"><div class="eyebrow">Alpha / Beta</div><div class="value">${formatNumber(detail.results?.alpha)} / ${formatNumber(detail.results?.beta)}</div></div>
    </section>

    <section class="card">
      <h2>Equity Curve</h2>
      ${renderEquityChart(detail)}
    </section>

    <section class="two-col">
      <div class="card">
        <h2>Yearly Performance</h2>
        <table>
          <thead><tr><th>Year</th><th class="num">Strategy</th><th class="num">Benchmark</th><th class="num">Excess</th></tr></thead>
          <tbody>${yearlyRows || '<tr><td colspan="4" class="empty">No yearly data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Feature Importance</h2>
        <table>
          <thead><tr><th>Factor</th><th class="num">Importance</th></tr></thead>
          <tbody>${factorRows || '<tr><td colspan="2" class="empty">No factor data</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="three-col">
      <div class="card"><div class="eyebrow">Average Rank IC</div><div class="value">${formatNumber(avgRankIc, 4)}</div></div>
      <div class="card"><div class="eyebrow">Average Top-Bottom Spread</div><div class="value">${formatPercent(avgSpread)}</div></div>
      <div class="card"><div class="eyebrow">Latest Score Std Dev</div><div class="value">${formatNumber(lastDispersion?.std, 4)}</div></div>
    </section>

    <section class="two-col">
      <div class="card">
        <h2>Grouped Forward Return</h2>
        <table>
          <thead><tr><th>Bucket</th><th class="num">Avg Return</th></tr></thead>
          <tbody>${groupedReturnRows || '<tr><td colspan="2" class="empty">No diagnostics</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <h2>Trade Log</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Symbol</th><th>Name</th><th>Side</th>
              <th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th>
              <th class="num">Fee</th><th class="num">P/L</th><th class="num">Return</th>
            </tr>
          </thead>
          <tbody>${tradeRows || '<tr><td colspan="10" class="empty">No trades</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}
