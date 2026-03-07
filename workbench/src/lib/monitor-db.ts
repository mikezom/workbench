import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initMonitorSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_monitoring (
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
      task_id INTEGER NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
      report_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      activity_type TEXT NOT NULL CHECK (activity_type IN (
        'file_read', 'file_write', 'command',
        'phase_change', 'process_start', 'process_end'
      )),
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_activity_log_task
      ON agent_activity_log(task_id, timestamp);
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitoringRecord {
  task_id: number;
  process_id: number | null;
  subprocess_pids: string | null;
  current_phase: string | null;
  current_file: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  started_at: string;
  last_updated: string;
}

export interface InvestigationReport {
  task_id: number;
  report_markdown: string;
  created_at: string;
}

export interface InvestigationReportWithTitle extends InvestigationReport {
  task_title: string;
}

export interface ActivityLogEntry {
  id: number;
  task_id: number;
  timestamp: string;
  activity_type:
    | "file_read"
    | "file_write"
    | "command"
    | "phase_change"
    | "process_start"
    | "process_end";
  details: string | null;
}

// ---------------------------------------------------------------------------
// agent_monitoring CRUD
// ---------------------------------------------------------------------------

export function createMonitoringRecord(
  db: Database.Database,
  data: {
    task_id: number;
    process_id?: number;
    subprocess_pids?: string;
    current_phase?: string;
    current_file?: string;
    cpu_percent?: number;
    memory_mb?: number;
  }
): MonitoringRecord {
  db.prepare(
    `INSERT INTO agent_monitoring
       (task_id, process_id, subprocess_pids, current_phase, current_file, cpu_percent, memory_mb)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.task_id,
    data.process_id ?? null,
    data.subprocess_pids ?? null,
    data.current_phase ?? null,
    data.current_file ?? null,
    data.cpu_percent ?? null,
    data.memory_mb ?? null
  );

  return getMonitoringRecord(db, data.task_id)!;
}

export function getMonitoringRecord(
  db: Database.Database,
  taskId: number
): MonitoringRecord | null {
  const row = db
    .prepare("SELECT * FROM agent_monitoring WHERE task_id = ?")
    .get(taskId) as MonitoringRecord | undefined;
  return row ?? null;
}

export function deleteMonitoringRecord(
  db: Database.Database,
  taskId: number
): boolean {
  const result = db
    .prepare("DELETE FROM agent_monitoring WHERE task_id = ?")
    .run(taskId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// investigation_reports CRUD
// ---------------------------------------------------------------------------

export function createInvestigationReport(
  db: Database.Database,
  data: {
    task_id: number;
    report_markdown: string;
  }
): InvestigationReport {
  db.prepare(
    `INSERT INTO investigation_reports (task_id, report_markdown)
     VALUES (?, ?)`
  ).run(data.task_id, data.report_markdown);

  return getInvestigationReport(db, data.task_id)!;
}

export function getInvestigationReport(
  db: Database.Database,
  taskId: number
): InvestigationReport | null {
  const row = db
    .prepare("SELECT * FROM investigation_reports WHERE task_id = ?")
    .get(taskId) as InvestigationReport | undefined;
  return row ?? null;
}

export function getAllInvestigationReports(
  db: Database.Database
): InvestigationReportWithTitle[] {
  return db
    .prepare(
      `SELECT r.task_id, r.report_markdown, r.created_at, t.title AS task_title
       FROM investigation_reports r
       JOIN agent_tasks t ON t.id = r.task_id
       ORDER BY r.created_at DESC`
    )
    .all() as InvestigationReportWithTitle[];
}

// ---------------------------------------------------------------------------
// agent_activity_log CRUD
// ---------------------------------------------------------------------------

export function logActivity(
  db: Database.Database,
  data: {
    task_id: number;
    activity_type: ActivityLogEntry["activity_type"];
    details?: string;
  }
): ActivityLogEntry {
  const result = db
    .prepare(
      `INSERT INTO agent_activity_log (task_id, activity_type, details)
       VALUES (?, ?, ?)`
    )
    .run(data.task_id, data.activity_type, data.details ?? null);

  return db
    .prepare("SELECT * FROM agent_activity_log WHERE id = ?")
    .get(result.lastInsertRowid) as ActivityLogEntry;
}

export function getActivityLog(
  db: Database.Database,
  taskId: number,
  opts?: { limit?: number; offset?: number }
): ActivityLogEntry[] {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return db
    .prepare(
      `SELECT * FROM agent_activity_log
       WHERE task_id = ?
       ORDER BY timestamp ASC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(taskId, limit, offset) as ActivityLogEntry[];
}
