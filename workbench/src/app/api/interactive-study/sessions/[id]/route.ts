import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask, AgentTaskStatus } from "@/lib/agent-db";

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
  } catch {
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

    // Whitelist allowed fields - allow updating title, prompt, and status
    const allowedUpdates: { title?: string; prompt?: string; status?: AgentTaskStatus } = {};
    if (body.title !== undefined) allowedUpdates.title = body.title;
    if (body.prompt !== undefined) allowedUpdates.prompt = body.prompt;
    if (body.status !== undefined) {
      // Only allow transitioning to 'finished' status for interactive-study sessions
      if (body.status !== "finished") {
        return NextResponse.json({ error: "Invalid status. Only 'finished' is allowed." }, { status: 400 });
      }
      allowedUpdates.status = body.status as AgentTaskStatus;
    }

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
  } catch {
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
  } catch {
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
