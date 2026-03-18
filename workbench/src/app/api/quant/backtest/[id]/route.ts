import { NextRequest, NextResponse } from "next/server";
import { deleteBacktestRun } from "@/lib/quant-db";
import { getBacktestDetail } from "@/lib/quant-report";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const detail = getBacktestDetail(Number(params.id));
  if (!detail) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteBacktestRun(Number(params.id));
  if (!deleted) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
