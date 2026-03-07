import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Migration: Add investigation task type and monitoring tables.
 *
 * 1. Checks whether the agent_tasks CHECK constraint already allows
 *    task_type = 'investigation'.
 * 2. If not, recreates agent_tasks with the updated constraint.
 * 3. Creates the three new tables: agent_monitoring, investigation_reports,
 *    agent_activity_log.
 */
export async function POST() {
  try {
    const db = getDb();

    db.transaction(() => {
      // ── 1. Probe whether 'investigation' is already accepted ──────────
      let needsRecreate = false;
      try {
        db.exec(
          `INSERT INTO agent_tasks (title, prompt, task_type) VALUES ('__migration_probe__', '__probe__', 'investigation')`
        );
        // Worked – constraint already includes 'investigation'
        db.exec(
          `DELETE FROM agent_tasks WHERE title = '__migration_probe__'`
        );
      } catch {
        // CHECK constraint failed → need to recreate the table
        needsRecreate = true;
      }

      // ── 2. Recreate agent_tasks if constraint is outdated ─────────────
      if (needsRecreate) {
        db.exec(`
          ALTER TABLE agent_tasks RENAME TO agent_tasks_old;

          CREATE TABLE agent_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting_for_dev'
              CHECK (status IN (
                'waiting_for_dev', 'developing', 'waiting_for_review',
                'finished', 'failed', 'cancelled',
                'decompose_understanding', 'decompose_waiting_for_answers',
                'decompose_breaking_down', 'decompose_waiting_for_approval',
                'decompose_approved', 'decompose_waiting_for_completion',
                'decompose_reflecting', 'decompose_complete'
              )),
            parent_objective TEXT,
            parent_task_id INTEGER REFERENCES agent_tasks(id) ON DELETE SET NULL,
            task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation')),
            branch_name TEXT,
            worktree_path TEXT,
            error_message TEXT,
            commit_id TEXT,
            decompose_breakdown TEXT,
            decompose_user_comment TEXT,
            user_task_comment TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            completed_at TEXT
          );

          INSERT INTO agent_tasks
            SELECT * FROM agent_tasks_old;

          DROP TABLE agent_tasks_old;

          CREATE INDEX IF NOT EXISTS idx_agent_task_output_task
            ON agent_task_output(task_id, timestamp);
        `);
      }

      // ── 3. Create new monitoring tables ───────────────────────────────
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_monitoring (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
          process_id INTEGER,
          subprocess_pids TEXT,
          current_phase TEXT,
          current_file TEXT,
          cpu_percent REAL,
          memory_mb REAL,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_updated TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS investigation_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
          report_markdown TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS agent_activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          activity_type TEXT NOT NULL CHECK (activity_type IN (
            'file_read', 'file_write', 'command', 'phase_change',
            'process_start', 'process_end'
          )),
          details TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_activity_log_task_time
          ON agent_activity_log(task_id, timestamp);
      `);
    })();

    return NextResponse.json({
      migrated: true,
      message: "Migration complete: investigation task type and monitoring tables ready.",
    });
  } catch (error) {
    console.error("Monitor migration failed:", error);
    return NextResponse.json(
      {
        migrated: false,
        message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
