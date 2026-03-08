import { NextRequest, NextResponse } from "next/server";
import { getTask, getSubTasks } from "@/lib/agent-db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = parseInt(params.id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
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

    const subTasks = getSubTasks(taskId);

    return NextResponse.json({
      sub_tasks: subTasks.map((t) => ({
        id: t.id,
        title: t.title,
        prompt: t.prompt,
        status: t.status,
        commit_id: t.commit_id,
        user_task_comment: t.user_task_comment,
        error_message: t.error_message,
        created_at: t.created_at,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get sub-tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
