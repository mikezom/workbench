import { NextRequest, NextResponse } from "next/server";
import { getAllGroups, createGroup } from "@/lib/db";

export function GET() {
  const groups = getAllGroups();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, parent_id, settings } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const group = createGroup(name.trim(), parent_id ?? null, settings);
  return NextResponse.json(group, { status: 201 });
}
