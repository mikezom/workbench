import { NextRequest, NextResponse } from "next/server";
import { getStrategy, updateStrategy, deleteStrategy } from "@/lib/quant-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const strategy = getStrategy(Number(params.id));
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }
  return NextResponse.json(strategy);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const strategy = updateStrategy(Number(params.id), body);
  if (!strategy) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }
  return NextResponse.json(strategy);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteStrategy(Number(params.id));
  if (!deleted) {
    return NextResponse.json({ error: "Strategy not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
