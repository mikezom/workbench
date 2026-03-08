import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/agent-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task || task.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existing = getTask(id);
  if (!existing || existing.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const task = updateTask(id, body);
  return NextResponse.json(task);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existing = getTask(id);
  if (!existing || existing.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  deleteTask(id);
  return NextResponse.json({ ok: true });
}
