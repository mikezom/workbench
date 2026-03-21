import { NextRequest, NextResponse } from "next/server";
import { deleteBacktestRun, updateBacktestRun } from "@/lib/quant-db";
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  if (typeof body.bookmarked !== "boolean") {
    return NextResponse.json({ error: "bookmarked must be a boolean" }, { status: 400 });
  }

  const updated = updateBacktestRun(Number(params.id), { bookmarked: body.bookmarked });
  if (!updated) {
    return NextResponse.json({ error: "Backtest run not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
