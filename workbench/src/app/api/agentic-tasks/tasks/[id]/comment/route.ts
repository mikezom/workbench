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

    if (task.task_type !== "worker") {
      return NextResponse.json(
        { error: "Not a worker task" },
        { status: 400 }
      );
    }

    if (task.status !== "finished" && task.status !== "failed") {
      return NextResponse.json(
        { error: "Task is not completed" },
        { status: 400 }
      );
    }

    // Add user comment
    updateTask(taskId, {
      user_task_comment: comment.trim(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add comment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
