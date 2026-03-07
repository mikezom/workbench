import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       t.id as task_id, t.title, t.status, t.task_type,
       t.started_at, t.prompt,
       m.process_id, m.subprocess_pids, m.current_phase,
       m.current_file, m.cpu_percent, m.memory_mb,
       m.started_at as monitor_started_at, m.last_updated
     FROM agent_tasks t
     LEFT JOIN agent_monitoring m ON m.task_id = t.id
     WHERE t.status IN ('developing', 'decompose_understanding',
       'decompose_breaking_down', 'decompose_reflecting')`
  ).all();
  return NextResponse.json(rows);
}
