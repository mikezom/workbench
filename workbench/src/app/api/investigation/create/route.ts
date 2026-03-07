import { NextResponse } from "next/server";
import { createTask } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { title, prompt } = body;

  if (!title || !prompt) {
    return NextResponse.json(
      { error: "title and prompt are required" },
      { status: 400 }
    );
  }

  const task = createTask({
    title,
    prompt,
    task_type: "investigation",
  });

  return NextResponse.json(task, { status: 201 });
}
