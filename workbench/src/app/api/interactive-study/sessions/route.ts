import { NextRequest, NextResponse } from "next/server";
import { createTask, getAllTasks } from "@/lib/agent-db";

export function GET() {
  const allTasks = getAllTasks();
  const sessions = allTasks.filter((t) => t.task_type === "interactive-study");
  // Sort newest first
  sessions.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, topic } = body;

  const sessionTitle = title?.trim() || `Study Session — ${new Date().toLocaleDateString()}`;
  const prompt = topic?.trim() || "";

  const task = createTask({
    title: sessionTitle,
    prompt: prompt,
    task_type: "interactive-study",
  });

  return NextResponse.json(task, { status: 201 });
}
