import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId: taskIdStr } = await params;
  const taskId = parseInt(taskIdStr, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM agent_activity_log WHERE task_id = ? ORDER BY timestamp DESC LIMIT 50`
  ).all(taskId);

  return NextResponse.json(rows);
}
