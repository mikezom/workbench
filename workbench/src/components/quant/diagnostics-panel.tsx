"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface DiagnosticsData {
  rank_ic: Array<{ date: string; value: number }>;
  score_dispersion: Array<{ date: string; mean: number; std: number; min: number; max: number }>;
  top_bottom_spread: Array<{ date: string; value: number }>;
  grouped_return: Array<{ bucket: string; avg_return: number }>;
  audit?: {
    future_label_overlap?: {
      status: string;
      checked_windows: number;
      candidate_rows: number;
      blocked_overlap_rows: number;
      flagged_windows: number;
      sample_windows: Array<{
        signal_date: string;
        blocked_overlap_rows: number;
      }>;
    };
    execution_timing?: {
      status: string;
      signal_source: string;
      execution_source: string;
      bars_between_signal_and_execution: number;
    };
  };
}

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsData | null;
}

const EXPLANATIONS = {
  rankIc: "Rank IC measures how well the model's ranking matches future returns on each rebalance date. Higher and more stable values usually indicate stronger stock selection skill.",
  predictionDispersion: "Prediction dispersion shows how spread out the model scores are. Higher dispersion means the model is making more differentiated bets instead of clustering around the same score.",
  topBottomSpread: "Top vs Bottom spread tracks the forward return gap between the highest-ranked and lowest-ranked groups. A consistently positive spread suggests the ranking is economically useful.",
  groupedReturn: "Grouped forward return buckets assets from weakest to strongest model score. A monotonic rise from low to high buckets usually means the signal quality is improving.",
} as const;

export default function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  if (!diagnostics) {
    return <div className="text-neutral-400 text-sm text-center py-8">No diagnostics data</div>;
  }

  const overlapAudit = diagnostics.audit?.future_label_overlap;
  const executionAudit = diagnostics.audit?.execution_timing;
  const hasData = diagnostics.rank_ic.length > 0
    || diagnostics.score_dispersion.length > 0
    || diagnostics.top_bottom_spread.length > 0
    || diagnostics.grouped_return.length > 0
    || Boolean(overlapAudit)
    || Boolean(executionAudit);

  if (!hasData) {
    return <div className="text-neutral-400 text-sm text-center py-8">No diagnostics data</div>;
  }

  return (
    <div className="space-y-4">
      {(overlapAudit || executionAudit) && (
        <div className="grid grid-cols-2 gap-4 portrait:grid-cols-1">
          {overlapAudit && (
            <IndicatorCard
              title="Future-Label Overlap Audit"
              explanation="Checks whether any training label would extend past the rebalance signal date. Blocked overlaps indicate the engine prevented lookahead leakage."
            >
              <AuditList
                items={[
                  ["Status", overlapAudit.status.toUpperCase()],
                  ["Checked windows", String(overlapAudit.checked_windows)],
                  ["Candidate rows", overlapAudit.candidate_rows.toLocaleString()],
                  ["Blocked overlap rows", overlapAudit.blocked_overlap_rows.toLocaleString()],
                  ["Flagged windows", String(overlapAudit.flagged_windows)],
                  ["Sample windows", overlapAudit.sample_windows.length
                    ? overlapAudit.sample_windows.map((sample) => (
                      `${sample.signal_date} (${sample.blocked_overlap_rows.toLocaleString()} rows)`
                    )).join(", ")
                    : "None"],
                ]}
              />
            </IndicatorCard>
          )}

          {executionAudit && (
            <IndicatorCard
              title="Execution Timing Audit"
              explanation="Confirms the engine no longer trades on the same bar that generated close-based factors."
            >
              <AuditList
                items={[
                  ["Status", executionAudit.status.toUpperCase()],
                  ["Signal source", executionAudit.signal_source],
                  ["Execution source", executionAudit.execution_source],
                  ["Lag bars", String(executionAudit.bars_between_signal_and_execution)],
                ]}
              />
            </IndicatorCard>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 portrait:grid-cols-1">
        <IndicatorCard
          title="Rank IC"
          explanation={EXPLANATIONS.rankIc}
        >
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
        </IndicatorCard>

        <IndicatorCard
          title="Prediction Dispersion"
          explanation={EXPLANATIONS.predictionDispersion}
        >
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
        </IndicatorCard>
      </div>

      <div className="grid grid-cols-2 gap-4 portrait:grid-cols-1">
        <IndicatorCard
          title="Top vs Bottom Spread"
          explanation={EXPLANATIONS.topBottomSpread}
        >
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
        </IndicatorCard>

        <IndicatorCard
          title="Grouped Forward Return"
          explanation={EXPLANATIONS.groupedReturn}
        >
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
        </IndicatorCard>
      </div>
    </div>
  );
}

function IndicatorCard({
  title,
  explanation,
  children,
}: {
  title: string;
  explanation: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded p-3">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500 mt-1 leading-5">{explanation}</div>
      </div>
      {children}
    </div>
  );
}

function AuditList({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="text-right font-medium text-neutral-800 dark:text-neutral-100">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
