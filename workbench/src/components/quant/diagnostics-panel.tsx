"use client";

import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface DiagnosticsData {
  rank_ic: Array<{ date: string; value: number }>;
  score_dispersion: Array<{ date: string; mean: number; std: number; min: number; max: number }>;
  top_bottom_spread: Array<{ date: string; value: number }>;
  grouped_return: Array<{ bucket: string; avg_return: number }>;
}

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsData | null;
}

export default function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (!diagnostics) {
    return <div className="text-neutral-400 text-sm text-center py-8">No diagnostics data</div>;
  }

  const hasData = diagnostics.rank_ic.length > 0
    || diagnostics.score_dispersion.length > 0
    || diagnostics.top_bottom_spread.length > 0
    || diagnostics.grouped_return.length > 0;

  if (!hasData) {
    return <div className="text-neutral-400 text-sm text-center py-8">No diagnostics data</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 portrait:grid-cols-1">
        <div className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
          <Plot
            data={[
              {
                x: diagnostics.rank_ic.map((point) => point.date),
                y: diagnostics.rank_ic.map((point) => point.value),
                type: "scatter",
                mode: "lines",
                line: { color: "#2563eb", width: 2 },
              },
            ]}
            layout={{
              title: { text: "Rank IC", font: { size: 14 } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { color: "#a3a3a3", size: 11 },
              margin: { t: 40, r: 20, b: 40, l: 40 },
              height: 260,
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: "100%" }}
          />
        </div>

        <div className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
          <Plot
            data={[
              {
                x: diagnostics.score_dispersion.map((point) => point.date),
                y: diagnostics.score_dispersion.map((point) => point.std),
                type: "scatter",
                mode: "lines",
                line: { color: "#ea580c", width: 2 },
                name: "Std Dev",
              },
              {
                x: diagnostics.score_dispersion.map((point) => point.date),
                y: diagnostics.score_dispersion.map((point) => point.mean),
                type: "scatter",
                mode: "lines",
                line: { color: "#64748b", width: 1.5, dash: "dot" },
                name: "Mean",
              },
            ]}
            layout={{
              title: { text: "Prediction Dispersion", font: { size: 14 } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { color: "#a3a3a3", size: 11 },
              margin: { t: 40, r: 20, b: 40, l: 40 },
              height: 260,
              legend: { orientation: "h", y: 1.12, x: 0 },
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 portrait:grid-cols-1">
        <div className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
          <Plot
            data={[
              {
                x: diagnostics.top_bottom_spread.map((point) => point.date),
                y: diagnostics.top_bottom_spread.map((point) => point.value),
                type: "scatter",
                mode: "lines",
                line: { color: "#16a34a", width: 2 },
              },
            ]}
            layout={{
              title: { text: "Top vs Bottom Spread", font: { size: 14 } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { color: "#a3a3a3", size: 11 },
              margin: { t: 40, r: 20, b: 40, l: 40 },
              height: 260,
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: "100%" }}
          />
        </div>

        <div className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
          <Plot
            data={[
              {
                x: diagnostics.grouped_return.map((point) => point.bucket),
                y: diagnostics.grouped_return.map((point) => point.avg_return),
                type: "bar",
                marker: {
                  color: diagnostics.grouped_return.map((point) => (
                    point.avg_return >= 0 ? "#16a34a" : "#dc2626"
                  )),
                },
              },
            ]}
            layout={{
              title: { text: "Grouped Forward Return", font: { size: 14 } },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              font: { color: "#a3a3a3", size: 11 },
              margin: { t: 40, r: 20, b: 40, l: 40 },
              height: 260,
            }}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
