"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface FactorAnalysisProps {
  importance: Record<string, number>;
}

export default function FactorAnalysis({ importance }: FactorAnalysisProps) {
  if (!importance || Object.keys(importance).length === 0) {
    return <div className="text-neutral-400 text-sm text-center py-8">No factor importance data</div>;
  }

  // Sort by absolute importance
  const sorted = Object.entries(importance).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const labels = sorted.map(([name]) => name);
  const values = sorted.map(([, val]) => val);

  return (
    <Plot
      data={[
        {
          x: values,
          y: labels,
          type: "bar",
          orientation: "h",
          marker: {
            color: values.map((v) => (v >= 0 ? "#3b82f6" : "#ef4444")),
          },
        },
      ]}
      layout={{
        title: { text: "Factor Importance", font: { size: 14 } },
        xaxis: { title: "Importance", gridcolor: "rgba(128,128,128,0.1)" },
        yaxis: { autorange: "reversed" },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#a3a3a3", size: 11 },
        margin: { t: 40, r: 20, b: 40, l: 140 },
        height: Math.max(250, labels.length * 25),
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%" }}
    />
  );
}
