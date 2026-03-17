"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface MonthlyReturnsHeatmapProps {
  data: Array<{ year: number; month: number; return: number }>;
}

export default function MonthlyReturnsHeatmap({ data }: MonthlyReturnsHeatmapProps) {
  if (!data || data.length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No monthly return data</div>;
  }

  const years = [...new Set(data.map((d) => d.year))].sort();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Build 2D matrix: years x months
  const z: (number | null)[][] = years.map((year) =>
    months.map((month) => {
      const entry = data.find((d) => d.year === year && d.month === month);
      return entry ? entry.return : null;
    })
  );

  // Text annotations
  const text: string[][] = z.map((row) =>
    row.map((v) => (v !== null ? `${(v * 100).toFixed(1)}%` : ""))
  );

  return (
    <Plot
      data={[
        {
          z,
          x: monthLabels,
          y: years.map(String),
          type: "heatmap",
          colorscale: [
            [0, "#ef4444"],
            [0.5, "#fafafa"],
            [1, "#22c55e"],
          ],
          zmid: 0,
          text,
          texttemplate: "%{text}",
          hovertemplate: "%{y} %{x}: %{text}<extra></extra>",
          showscale: true,
          colorbar: {
            title: "Return",
            tickformat: ".0%",
          },
        } as Plotly.Data,
      ]}
      layout={{
        title: { text: "Monthly Returns", font: { size: 14 } },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#a3a3a3", size: 11 },
        margin: { t: 40, r: 80, b: 40, l: 50 },
        height: 250,
        xaxis: { side: "top" },
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%" }}
    />
  );
}
