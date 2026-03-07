import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskType = searchParams.get("type");
  const db = getDb();

  let query = `SELECT id, title, status, task_type, created_at, started_at, completed_at,
                      error_message, parent_task_id
               FROM agent_tasks`;
  const params: string[] = [];

  if (taskType && taskType !== "all") {
    query += " WHERE task_type = ?";
    params.push(taskType);
  }

  query += " ORDER BY created_at DESC LIMIT 100";
  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}
