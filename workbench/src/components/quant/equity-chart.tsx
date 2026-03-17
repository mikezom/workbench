"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface EquityChartProps {
  data: Array<{ date: string; value: number }>;
  benchmarkReturn?: number;
  initialCapital?: number;
}

export default function EquityChart({ data, benchmarkReturn, initialCapital = 1000000 }: EquityChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No equity data</div>;
  }

  const dates = data.map((d) => d.date);
  const values = data.map((d) => d.value);

  const traces: Plotly.Data[] = [
    {
      x: dates,
      y: values,
      type: "scatter",
      mode: "lines",
      name: "Strategy",
      line: { color: "#3b82f6", width: 2 },
    },
  ];

  // Benchmark line (simplified linear growth)
  if (benchmarkReturn !== undefined && initialCapital) {
    const benchmarkValues = dates.map((_, i) => {
      const progress = i / Math.max(dates.length - 1, 1);
      return initialCapital * (1 + benchmarkReturn * progress);
    });
    traces.push({
      x: dates,
      y: benchmarkValues,
      type: "scatter",
      mode: "lines",
      name: "Benchmark",
      line: { color: "#9ca3af", width: 1.5, dash: "dash" },
    });
  }

  return (
    <Plot
      data={traces}
      layout={{
        title: { text: "Equity Curve", font: { size: 14 } },
        xaxis: { title: "Date", gridcolor: "rgba(128,128,128,0.1)" },
        yaxis: { title: "Portfolio Value", gridcolor: "rgba(128,128,128,0.1)" },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#a3a3a3", size: 11 },
        margin: { t: 40, r: 20, b: 40, l: 70 },
        legend: { x: 0, y: 1.1, orientation: "h" },
        height: 350,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%" }}
    />
  );
}
