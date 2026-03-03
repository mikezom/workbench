import { NextRequest, NextResponse } from "next/server";
import { updateCard, deleteCard } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { front, back, group_id, title, definition, example } = body;
  const card = updateCard(params.id, {
    front,
    back,
    group_id,
    title,
    definition,
    example,
  });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json(card);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteCard(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
