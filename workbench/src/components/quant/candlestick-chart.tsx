"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface OhlcvData {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
}

interface Signal {
  date: string;
  type: "buy" | "sell";
}

interface CandlestickChartProps {
  data: OhlcvData[];
  signals?: Signal[];
  title?: string;
}

export default function CandlestickChart({ data, signals, title }: CandlestickChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No OHLCV data</div>;
  }

  const dates = data.map((d) => d.trade_date);

  const traces: Plotly.Data[] = [
    {
      x: dates,
      open: data.map((d) => d.open),
      high: data.map((d) => d.high),
      low: data.map((d) => d.low),
      close: data.map((d) => d.close),
      type: "candlestick",
      name: "OHLC",
      increasing: { line: { color: "#ef4444" } },
      decreasing: { line: { color: "#22c55e" } },
      xaxis: "x",
      yaxis: "y",
    } as Plotly.Data,
    {
      x: dates,
      y: data.map((d) => d.vol),
      type: "bar",
      name: "Volume",
      marker: {
        color: data.map((d, i) =>
          i > 0 && d.close >= data[i - 1].close ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"
        ),
      },
      xaxis: "x",
      yaxis: "y2",
    },
  ];

  // Buy/sell signals
  if (signals && signals.length > 0) {
    const buys = signals.filter((s) => s.type === "buy");
    const sells = signals.filter((s) => s.type === "sell");
    const findPrice = (date: string) => data.find((d) => d.trade_date === date)?.low ?? 0;
    const findHigh = (date: string) => data.find((d) => d.trade_date === date)?.high ?? 0;

    if (buys.length > 0) {
      traces.push({
        x: buys.map((s) => s.date),
        y: buys.map((s) => findPrice(s.date) * 0.98),
        mode: "markers",
        type: "scatter",
        name: "Buy",
        marker: { symbol: "triangle-up", size: 10, color: "#ef4444" },
        xaxis: "x",
        yaxis: "y",
      });
    }
    if (sells.length > 0) {
      traces.push({
        x: sells.map((s) => s.date),
        y: sells.map((s) => findHigh(s.date) * 1.02),
        mode: "markers",
        type: "scatter",
        name: "Sell",
        marker: { symbol: "triangle-down", size: 10, color: "#22c55e" },
        xaxis: "x",
        yaxis: "y",
      });
    }
  }

  return (
    <Plot
      data={traces}
      layout={{
        title: { text: title ?? "Candlestick Chart", font: { size: 14 } },
        xaxis: { rangeslider: { visible: false }, gridcolor: "rgba(128,128,128,0.1)" },
        yaxis: { title: "Price", domain: [0.25, 1], gridcolor: "rgba(128,128,128,0.1)" },
        yaxis2: { title: "Volume", domain: [0, 0.2], gridcolor: "rgba(128,128,128,0.1)" },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#a3a3a3", size: 11 },
        margin: { t: 40, r: 20, b: 40, l: 70 },
        height: 450,
        showlegend: false,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%" }}
    />
  );
}
