import { NextRequest, NextResponse } from "next/server";
import { getTask, getQuestions } from "@/lib/agent-db";

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

    // Get questions if any
    const questions = getQuestions(taskId);

    // Parse breakdown if available
    let breakdown = null;
    if (task.decompose_breakdown) {
      try {
        breakdown = JSON.parse(task.decompose_breakdown);
      } catch {
        breakdown = null;
      }
    }

    return NextResponse.json({
      task: {
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        status: task.status,
        error_message: task.error_message,
        created_at: task.created_at,
        started_at: task.started_at,
        completed_at: task.completed_at,
      },
      questions: questions.map((q) => ({
        id: q.question_id,
        question: q.question,
        options: JSON.parse(q.options),
        answer: q.answer,
      })),
      breakdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get decompose task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
