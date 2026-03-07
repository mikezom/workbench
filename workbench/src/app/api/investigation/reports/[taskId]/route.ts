import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

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
  const report = db.prepare(
    `SELECT r.*, t.title, t.prompt, t.status, t.created_at as task_created_at
     FROM investigation_reports r
     JOIN agent_tasks t ON t.id = r.task_id
     WHERE r.task_id = ?`
  ).get(taskId);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
