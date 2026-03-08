import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, createTask } from "@/lib/agent-db";

export async function POST(
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

    if (task.status !== "decompose_waiting_for_approval") {
      return NextResponse.json(
        { error: "Task is not waiting for approval" },
        { status: 400 }
      );
    }

    if (!task.decompose_breakdown) {
      return NextResponse.json(
        { error: "No breakdown available" },
        { status: 400 }
      );
    }

    // Parse breakdown
    let breakdown: Array<{ title: string; prompt: string }>;
    try {
      breakdown = JSON.parse(task.decompose_breakdown);
    } catch {
      return NextResponse.json(
        { error: "Invalid breakdown format" },
        { status: 500 }
      );
    }

    // Create sub-tasks
    const subTaskIds: number[] = [];
    for (const subTask of breakdown) {
      const created = createTask({
        title: subTask.title,
        prompt: subTask.prompt,
        parent_objective: task.prompt,
        parent_task_id: taskId,
        task_type: "worker",
      });
      subTaskIds.push(created.id);
    }

    // Update decompose task status
    updateTask(taskId, {
      status: "decompose_approved",
    });

    // Transition to waiting_for_completion
    updateTask(taskId, {
      status: "decompose_waiting_for_completion",
    });

    return NextResponse.json({
      success: true,
      sub_task_ids: subTaskIds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to approve breakdown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
