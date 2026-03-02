import { NextRequest, NextResponse } from "next/server";
import { getAllGroups, createGroup } from "@/lib/groups";

export async function GET() {
  const groups = await getAllGroups();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, parent_id, settings } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const group = await createGroup(name.trim(), parent_id ?? null, settings);
  return NextResponse.json(group, { status: 201 });
}
