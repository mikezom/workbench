import { buildBacktestReportHtml, getBacktestDetail } from "@/lib/quant-report";

export function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const detail = getBacktestDetail(Number(params.id));
  if (!detail) {
    return new Response("Backtest run not found", { status: 404 });
  }

  const html = buildBacktestReportHtml(detail);
  const filename = `quant-backtest-${detail.run.id}.html`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
