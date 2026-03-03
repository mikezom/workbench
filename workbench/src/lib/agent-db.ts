import type Database from "better-sqlite3";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initAgentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting_for_dev'
        CHECK (status IN (
          'waiting_for_dev', 'developing', 'waiting_for_review',
          'finished', 'failed', 'cancelled'
        )),
      parent_objective TEXT,
      branch_name TEXT,
      worktree_path TEXT,
      error_message TEXT,
      commit_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_task_output (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_task_output_task
      ON agent_task_output(task_id, timestamp);

    CREATE TABLE IF NOT EXISTS agent_lock (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      locked INTEGER NOT NULL DEFAULT 0,
      task_id INTEGER REFERENCES agent_tasks(id),
      locked_at TEXT
    );

    INSERT OR IGNORE INTO agent_lock (id, locked, task_id, locked_at)
      VALUES (1, 0, NULL, NULL);
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentTaskStatus =
  | "waiting_for_dev"
  | "developing"
  | "waiting_for_review"
  | "finished"
  | "failed"
  | "cancelled";

export interface AgentTask {
  id: number;
  title: string;
  prompt: string;
  status: AgentTaskStatus;
  parent_objective: string | null;
  branch_name: string | null;
  worktree_path: string | null;
  error_message: string | null;
  commit_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AgentTaskOutput {
  id: number;
  task_id: number;
  timestamp: string;
  type: string;
  content: string;
}

export interface AgentLock {
  id: number;
  locked: number;
  task_id: number | null;
  locked_at: string | null;
}

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

export function createTask(data: {
  title: string;
  prompt: string;
  parent_objective?: string;
}): AgentTask {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO agent_tasks (title, prompt, parent_objective)
       VALUES (?, ?, ?)`
    )
    .run(data.title, data.prompt, data.parent_objective ?? null);

  return getTask(result.lastInsertRowid as number)!;
}

export function getTask(id: number): AgentTask | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM agent_tasks WHERE id = ?")
    .get(id) as AgentTask | undefined;
  return row ?? null;
}

export function getAllTasks(status?: AgentTaskStatus): AgentTask[] {
  const db = getDb();
  if (status) {
    return db
      .prepare(
        "SELECT * FROM agent_tasks WHERE status = ? ORDER BY created_at DESC"
      )
      .all(status) as AgentTask[];
  }
  return db
    .prepare("SELECT * FROM agent_tasks ORDER BY created_at DESC")
    .all() as AgentTask[];
}

export function updateTask(
  id: number,
  updates: {
    title?: string;
    status?: AgentTaskStatus;
    branch_name?: string;
    worktree_path?: string;
    error_message?: string;
    commit_id?: string;
    started_at?: string;
    completed_at?: string;
  }
): AgentTask | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM agent_tasks WHERE id = ?")
    .get(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return getTask(id);

  values.push(id);
  db.prepare(`UPDATE agent_tasks SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getTask(id);
}

export function deleteTask(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Lock management
// ---------------------------------------------------------------------------

export function isLocked(): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT locked FROM agent_lock WHERE id = 1")
    .get() as AgentLock;
  return row.locked === 1;
}

export function getLockStatus(): AgentLock {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_lock WHERE id = 1")
    .get() as AgentLock;
}

export function acquireLock(taskId: number): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE agent_lock
       SET locked = 1, task_id = ?, locked_at = datetime('now')
       WHERE id = 1 AND locked = 0`
    )
    .run(taskId);
  return result.changes > 0;
}

export function releaseLock(): void {
  const db = getDb();
  db.prepare(
    "UPDATE agent_lock SET locked = 0, task_id = NULL, locked_at = NULL WHERE id = 1"
  ).run();
}

// ---------------------------------------------------------------------------
// Task output
// ---------------------------------------------------------------------------

export function appendTaskOutput(
  taskId: number,
  type: string,
  content: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO agent_task_output (task_id, type, content)
     VALUES (?, ?, ?)`
  ).run(taskId, type, content);
}

export function getTaskOutput(
  taskId: number,
  opts?: { limit?: number; offset?: number }
): AgentTaskOutput[] {
  const db = getDb();
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  return db
    .prepare(
      `SELECT * FROM agent_task_output
       WHERE task_id = ?
       ORDER BY timestamp ASC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(taskId, limit, offset) as AgentTaskOutput[];
}
