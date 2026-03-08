import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/agent-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  try {
    const task = getTask(id);
    if (!task || task.task_type !== "interactive-study") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: "Failed to retrieve session" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  try {
    const existing = getTask(id);
    if (!existing || existing.task_type !== "interactive-study") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const body = await req.json();

    // Whitelist allowed fields - only allow updating title and prompt
    const allowedUpdates: { title?: string; prompt?: string } = {};
    if (body.title !== undefined) allowedUpdates.title = body.title;
    if (body.prompt !== undefined) allowedUpdates.prompt = body.prompt;

    // Validate field lengths
    if (allowedUpdates.title && allowedUpdates.title.length > 200) {
      return NextResponse.json({ error: "Title too long (max 200 characters)" }, { status: 400 });
    }
    if (allowedUpdates.prompt && allowedUpdates.prompt.length > 5000) {
      return NextResponse.json({ error: "Prompt too long (max 5000 characters)" }, { status: 400 });
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const task = updateTask(id, allowedUpdates);
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  try {
    const existing = getTask(id);
    if (!existing || existing.task_type !== "interactive-study") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
