import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/agent-db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = parseInt(params.id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await req.json();
  const { comment } = body;

  if (!comment?.trim()) {
    return NextResponse.json(
      { error: "comment is required" },
      { status: 400 }
    );
  }

  try {
    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.task_type !== "decompose") {
      return NextResponse.json(
        { error: "Not a decompose task" },
        { status: 400 }
      );
    }

    if (task.status !== "decompose_waiting_for_approval") {
      return NextResponse.json(
        { error: "Task is not waiting for approval" },
        { status: 400 }
      );
    }

    // Store rejection comment and transition to breaking_down
    // The daemon will pick this up and retry
    updateTask(taskId, {
      status: "decompose_breaking_down",
      decompose_user_comment: comment.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reject breakdown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
