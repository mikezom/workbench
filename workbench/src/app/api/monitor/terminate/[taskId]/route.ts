import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId: taskIdStr } = await params;
  const taskId = parseInt(taskIdStr, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const db = getDb();

  const monitoring = db
    .prepare("SELECT process_id FROM agent_monitoring WHERE task_id = ?")
    .get(taskId) as { process_id: number | null } | undefined;

  db.prepare("UPDATE agent_tasks SET status = 'cancelled' WHERE id = ?").run(taskId);

  return NextResponse.json({
    cancelled: true,
    task_id: taskId,
    process_id: monitoring?.process_id ?? null,
    message: monitoring?.process_id
      ? "Task marked as cancelled. Agent will be terminated on next check."
      : "Task marked as cancelled (no active process found).",
  });
}
