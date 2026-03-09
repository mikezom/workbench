import { NextRequest, NextResponse } from "next/server";
import { createTask, getAllTasks, updateTask } from "@/lib/agent-db";

export function GET() {
  try {
    const allTasks = getAllTasks();
    const sessions = allTasks.filter((t) => t.task_type === "interactive-study");
    // Sort newest first
    sessions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: "Failed to retrieve sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, topic } = body;

    // Validate lengths
    if (title && title.length > 200) {
      return NextResponse.json({ error: "Title too long (max 200 characters)" }, { status: 400 });
    }
    if (topic && topic.length > 5000) {
      return NextResponse.json({ error: "Topic too long (max 5000 characters)" }, { status: 400 });
    }

    const sessionTitle = title?.trim() || `Study Session — ${new Date().toLocaleDateString()}`;
    const prompt = topic?.trim() || "";

    const task = createTask({
      title: sessionTitle,
      prompt: prompt,
      task_type: "interactive-study",
    });

    // Set to waiting_for_review (idle) instead of waiting_for_dev to prevent
    // the WorkerNewTaskHandler from picking up interactive-study tasks.
    updateTask(task.id, { status: "waiting_for_review" });

    return NextResponse.json({ ...task, status: "waiting_for_review" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
