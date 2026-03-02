import { NextRequest, NextResponse } from "next/server";
import { updateGroup, deleteGroup, getDescendantIds } from "@/lib/groups";
import { deleteCardsByGroupIds } from "@/lib/cards";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { name, settings } = body;
  const group = await updateGroup(params.id, { name, settings });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json(group);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Delete all cards in this group and its descendants first
  const idsToDelete = await getDescendantIds(params.id);
  const cardsDeleted = await deleteCardsByGroupIds(idsToDelete);

  const deleted = await deleteGroup(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, cardsDeleted });
}
