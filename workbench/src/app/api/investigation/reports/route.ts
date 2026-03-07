import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT r.task_id, r.report_markdown, r.created_at, t.title, t.status
     FROM investigation_reports r
     JOIN agent_tasks t ON t.id = r.task_id
     ORDER BY r.created_at DESC`
  ).all();
  return NextResponse.json(rows);
}
