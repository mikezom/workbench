import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/agent-db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt } = body;

  if (!prompt?.trim()) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }

  try {
    // Create a decompose task instead of calling LLM directly
    const task = createTask({
      title: "Decompose: " + prompt.slice(0, 50) + (prompt.length > 50 ? "..." : ""),
      prompt: prompt.trim(),
      task_type: "decompose",
    });

    // Set initial status to decompose_understanding
    // (The daemon will pick it up and start the decompose agent)
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    db.prepare(
      "UPDATE agent_tasks SET status = 'decompose_understanding' WHERE id = ?"
    ).run(task.id);

    return NextResponse.json({ task_id: task.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create decompose task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
