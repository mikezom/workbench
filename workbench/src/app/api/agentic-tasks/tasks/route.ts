import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, createTask, type AgentTaskStatus } from "@/lib/agent-db";

export function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as AgentTaskStatus | null;
  const tasks = getAllTasks(status ?? undefined);
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, prompt, parent_objective } = body;

  if (!title?.trim() || !prompt?.trim()) {
    return NextResponse.json(
      { error: "title and prompt are required" },
      { status: 400 }
    );
  }

  const task = createTask({
    title: title.trim(),
    prompt: prompt.trim(),
    parent_objective: parent_objective ?? undefined,
  });

  return NextResponse.json(task, { status: 201 });
}
