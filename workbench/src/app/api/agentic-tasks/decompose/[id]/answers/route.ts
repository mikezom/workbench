import { NextRequest, NextResponse } from "next/server";
import { getTask, answerQuestions } from "@/lib/agent-db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = parseInt(params.id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await req.json();
  const { answers } = body;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { error: "answers object is required" },
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

    if (task.status !== "decompose_waiting_for_answers") {
      return NextResponse.json(
        { error: "Task is not waiting for answers" },
        { status: 400 }
      );
    }

    // Save answers
    answerQuestions(taskId, answers);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to submit answers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
