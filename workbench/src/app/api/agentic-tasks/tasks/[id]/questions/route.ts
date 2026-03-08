import { NextRequest, NextResponse } from "next/server";
import { getTask, getQuestions, answerQuestions } from "@/lib/agent-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const questions = getQuestions(id);
  // Parse options JSON for the client
  const parsed = questions.map((q) => ({
    ...q,
    options: JSON.parse(q.options) as string[],
  }));

  return NextResponse.json(parsed);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "waiting_for_review") {
    return NextResponse.json(
      { error: "Task is not waiting for review" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const answers: Record<string, string> = body.answers;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { error: "answers object is required" },
      { status: 400 }
    );
  }

  answerQuestions(id, answers);

  return NextResponse.json({ ok: true });
}
