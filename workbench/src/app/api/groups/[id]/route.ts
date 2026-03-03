import { NextRequest, NextResponse } from "next/server";
import { updateGroup, deleteGroupCascade } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { name, settings } = body;
  const group = updateGroup(params.id, { name, settings });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json(group);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { deleted, cardsDeleted } = deleteGroupCascade(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, cardsDeleted });
}
