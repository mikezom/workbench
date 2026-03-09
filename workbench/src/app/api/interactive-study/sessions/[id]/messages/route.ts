import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, appendTaskOutput, getTaskOutput } from "@/lib/agent-db";

export async function GET(
  req: NextRequest,
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

    const sinceId = Number(req.nextUrl.searchParams.get("since")) || 0;
    const output = getTaskOutput(id);

    // Filter to only chat messages (user + assistant), optionally after sinceId
    const messages = output
      .filter((o) => o.type === "user" || o.type === "assistant")
      .filter((o) => sinceId ? o.id > sinceId : true);

    return NextResponse.json({
      messages,
      status: task.status,
    });
  } catch {
    return NextResponse.json({ error: "Failed to retrieve messages" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
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

    // Only allow sending when session is idle (waiting_for_review)
    // or freshly created (waiting_for_dev, for backwards compatibility)
    if (task.status !== "waiting_for_review" && task.status !== "waiting_for_dev") {
      const msg = task.status === "developing"
        ? "Agent is still responding. Please wait."
        : `Cannot send message — session status is '${task.status}'.`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const body = await req.json();
    const content = body.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Message content is required" },
        { status: 400 }
      );
    }

    if (content.length > 10000) {
      return NextResponse.json({ error: "Message too long (max 10000 characters)" }, { status: 400 });
    }

    // Store user message
    appendTaskOutput(id, "user", content);

    // Trigger daemon by setting status to developing
    updateTask(id, { status: "developing" });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
