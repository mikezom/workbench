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
          'finished', 'failed', 'cancelled',
          'decompose_understanding', 'decompose_waiting_for_answers',
          'decompose_breaking_down', 'decompose_waiting_for_approval',
          'decompose_approved', 'decompose_waiting_for_completion',
          'decompose_reflecting', 'decompose_complete'
        )),
      parent_objective TEXT,
      parent_task_id INTEGER REFERENCES agent_tasks(id) ON DELETE SET NULL,
      task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation', 'interactive-study')),
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

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_task_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      answer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_questions_task
      ON agent_task_questions(task_id);
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
  | "cancelled"
  | "decompose_understanding"
  | "decompose_waiting_for_answers"
  | "decompose_breaking_down"
  | "decompose_waiting_for_approval"
  | "decompose_approved"
  | "decompose_waiting_for_completion"
  | "decompose_reflecting"
  | "decompose_complete";

export type AgentTaskType = "worker" | "decompose" | "investigation" | "interactive-study";

export interface AgentTask {
  id: number;
  title: string;
  prompt: string;
  status: AgentTaskStatus;
  parent_objective: string | null;
  parent_task_id: number | null;
  task_type: AgentTaskType;
  branch_name: string | null;
  worktree_path: string | null;
  error_message: string | null;
  commit_id: string | null;
  decompose_breakdown: string | null;  // JSON string of breakdown
  decompose_user_comment: string | null;  // User's rejection comment
  user_task_comment: string | null;  // User's comment on completed task (for reflection)
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

export interface AgentTaskQuestion {
  id: number;
  task_id: number;
  question_id: string;
  question: string;
  options: string;  // JSON array string
  answer: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Task CRUD
// ---------------------------------------------------------------------------

export function createTask(data: {
  title: string;
  prompt: string;
  parent_objective?: string;
  parent_task_id?: number;
  task_type?: AgentTaskType;
}): AgentTask {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO agent_tasks (title, prompt, parent_objective, parent_task_id, task_type)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      data.title,
      data.prompt,
      data.parent_objective ?? null,
      data.parent_task_id ?? null,
      data.task_type ?? "worker"
    );

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
    decompose_breakdown?: string;
    decompose_user_comment?: string;
    user_task_comment?: string;
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

// ---------------------------------------------------------------------------
// Task questions
// ---------------------------------------------------------------------------

export function saveQuestions(
  taskId: number,
  questions: { id: string; question: string; options: string[] }[]
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO agent_task_questions (task_id, question_id, question, options)
     VALUES (?, ?, ?, ?)`
  );
  const insertAll = db.transaction(() => {
    for (const q of questions) {
      insert.run(taskId, q.id, q.question, JSON.stringify(q.options));
    }
  });
  insertAll();
}

export function getQuestions(taskId: number): AgentTaskQuestion[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM agent_task_questions
       WHERE task_id = ?
       ORDER BY id ASC`
    )
    .all(taskId) as AgentTaskQuestion[];
}

export function answerQuestions(
  taskId: number,
  answers: Record<string, string>
): void {
  const db = getDb();
  const update = db.prepare(
    `UPDATE agent_task_questions SET answer = ?
     WHERE task_id = ? AND question_id = ?`
  );
  const updateAll = db.transaction(() => {
    for (const [questionId, answer] of Object.entries(answers)) {
      update.run(answer, taskId, questionId);
    }
  });
  updateAll();
}

export function getTasksReadyToResume(): AgentTask[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.* FROM agent_tasks t
       WHERE t.status = 'waiting_for_review'
       AND NOT EXISTS (
         SELECT 1 FROM agent_task_questions q
         WHERE q.task_id = t.id AND q.answer IS NULL
       )
       AND EXISTS (
         SELECT 1 FROM agent_task_questions q2
         WHERE q2.task_id = t.id
       )
       ORDER BY t.created_at ASC
       LIMIT 1`
    )
    .all() as AgentTask[];
}

// ---------------------------------------------------------------------------
// Decompose-specific functions
// ---------------------------------------------------------------------------

export function getSubTasks(parentTaskId: number): AgentTask[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM agent_tasks
       WHERE parent_task_id = ?
       ORDER BY created_at ASC`
    )
    .all(parentTaskId) as AgentTask[];
}

export function areAllSubTasksCommented(parentTaskId: number): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN user_task_comment IS NOT NULL THEN 1 ELSE 0 END) as commented
       FROM agent_tasks
       WHERE parent_task_id = ?
       AND status IN ('finished', 'failed')`
    )
    .get(parentTaskId) as { total: number; commented: number };

  return result.total > 0 && result.total === result.commented;
}

export function getDecomposeTasksReadyForReflection(): AgentTask[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.* FROM agent_tasks t
       WHERE t.task_type = 'decompose'
       AND t.status = 'decompose_waiting_for_completion'
       AND NOT EXISTS (
         SELECT 1 FROM agent_tasks sub
         WHERE sub.parent_task_id = t.id
         AND sub.status NOT IN ('finished', 'failed', 'cancelled')
       )
       AND NOT EXISTS (
         SELECT 1 FROM agent_tasks sub2
         WHERE sub2.parent_task_id = t.id
         AND sub2.user_task_comment IS NULL
         AND sub2.status IN ('finished', 'failed')
       )
       ORDER BY t.created_at ASC
       LIMIT 1`
    )
    .all() as AgentTask[];
}

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

export interface Agent {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Agent CRUD
// ---------------------------------------------------------------------------

export function createAgent(name: string, description?: string): Agent {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO agents (name, description) VALUES (?, ?)`
    )
    .run(name, description ?? null);

  return getAgent(result.lastInsertRowid as number)!;
}

export function getAgent(id: number): Agent | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM agents WHERE id = ?")
    .get(id) as Agent | undefined;
  return row ?? null;
}

export function getAgentByName(name: string): Agent | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM agents WHERE name = ?")
    .get(name) as Agent | undefined;
  return row ?? null;
}

export function getAllAgents(): Agent[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agents ORDER BY created_at DESC")
    .all() as Agent[];
}

export function updateAgent(
  id: number,
  updates: { name?: string; description?: string }
): Agent | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM agents WHERE id = ?")
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

  if (sets.length === 0) return getAgent(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getAgent(id);
}

export function deleteAgent(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

export function migrateAgentSchema(db: Database.Database): void {
  // Check if migration is needed by querying the schema directly
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_tasks'")
    .get() as { sql: string } | undefined;

  // If table doesn't exist or already has 'interactive-study', no migration needed
  if (!tableInfo || tableInfo.sql.includes("'interactive-study'")) {
    console.log("[migrateAgentSchema] Migration not needed or already applied");
    return;
  }

  console.log("[migrateAgentSchema] Starting migration to add 'interactive-study' task type");

  // Wrap entire migration in a transaction
  db.exec("BEGIN TRANSACTION");

  try {
    // Temporarily disable foreign key constraints to avoid CASCADE issues
    db.exec("PRAGMA foreign_keys = OFF");
    console.log("[migrateAgentSchema] Disabled foreign keys");

    // Create new table with updated constraint
    db.exec(`
      CREATE TABLE agent_tasks_new (
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
        parent_task_id INTEGER REFERENCES agent_tasks_new(id) ON DELETE SET NULL,
        task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation', 'interactive-study')),
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
    `);
    console.log("[migrateAgentSchema] Created new table with updated schema");

    // Copy all data from old table to new table
    db.exec("INSERT INTO agent_tasks_new SELECT * FROM agent_tasks");
    console.log("[migrateAgentSchema] Copied data to new table");

    // Drop the old table
    db.exec("DROP TABLE agent_tasks");
    console.log("[migrateAgentSchema] Dropped old table");

    // Rename new table to original name
    db.exec("ALTER TABLE agent_tasks_new RENAME TO agent_tasks");
    console.log("[migrateAgentSchema] Renamed new table");

    // Re-enable foreign key constraints
    db.exec("PRAGMA foreign_keys = ON");
    console.log("[migrateAgentSchema] Re-enabled foreign keys");

    // Commit the transaction
    db.exec("COMMIT");
    console.log("[migrateAgentSchema] Migration completed successfully");
  } catch (error) {
    // Rollback on any error
    db.exec("ROLLBACK");
    console.error("[migrateAgentSchema] Migration failed, rolled back:", error);
    throw new Error(
      `Failed to migrate agent_tasks schema: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
