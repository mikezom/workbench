import { NextRequest, NextResponse } from "next/server";
import { updateGroup, deleteGroup } from "@/lib/groups";

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
  const deleted = await deleteGroup(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
