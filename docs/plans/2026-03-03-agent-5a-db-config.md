# Phase 5a: Agent Database & Config — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent tables to SQLite, create the config file, and implement all agent DB operations.

**Architecture:** New `src/lib/agent-db.ts` file imports `getDb()` from `db.ts`. Schema init is called from `getDb()`. Config is a plain JSON file at `data/agent-config.json` (gitignored).

**Tech Stack:** TypeScript, better-sqlite3 (already installed), Next.js

---

### Task 1: Add agent schema initialization to db.ts

**Files:**
- Modify: `workbench/src/lib/db.ts:14-25` (getDb function)

**Step 1: Add `initAgentSchema` import and call in `getDb()`**

In `workbench/src/lib/db.ts`, add an import at the top:

```typescript
import { initAgentSchema } from "./agent-db";
```

And in the `getDb()` function, after `initSchema(_db)`, add:

```typescript
initAgentSchema(_db);
```

The full `getDb()` becomes:

```typescript
export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), "data", "workbench.db");
  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  initAgentSchema(_db);
  return _db;
}
```

**Step 2: Verify no import cycle**

`agent-db.ts` imports `getDb` from `db.ts`, and `db.ts` imports `initAgentSchema` from `agent-db.ts`. This is a circular import. To avoid it, `initAgentSchema` should NOT import from `db.ts`. It receives the `db` instance as a parameter — no cycle.

---

### Task 2: Create agent-db.ts with schema and types

**Files:**
- Create: `workbench/src/lib/agent-db.ts`

**Step 1: Write the file with schema, types, and all DB operations**

```typescript
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

    -- Ensure singleton lock row exists
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
      .prepare("SELECT * FROM agent_tasks WHERE status = ? ORDER BY created_at DESC")
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
```

**Step 3: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add workbench/src/lib/agent-db.ts workbench/src/lib/db.ts
git commit -m "feat(agent): add agent tables and DB operations (Phase 5a)"
```

---

### Task 3: Create agent config file and update .gitignore

**Files:**
- Create: `workbench/data/agent-config.json`
- Modify: `/Users/ccnas/DEVELOPMENT/workbench/.gitignore`

**Step 1: Create the default config file**

Write `workbench/data/agent-config.json`:

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "api_key": "",
    "base_url": "https://api.anthropic.com"
  }
}
```

**Step 2: Add gitignore entries**

Append to the repo-level `.gitignore`:

```
# Agent config (contains API keys)
workbench/data/agent-config.json

# Agent worktrees
workbench/.worktrees/

# Agent daemon logs
workbench/logs/
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add agent config file and gitignore entries"
```

Note: `agent-config.json` is gitignored so it won't be committed — that's intentional.

---

### Task 4: Verify everything works end-to-end

**Step 1: Run the build**

Run: `cd workbench && npm run build`
Expected: Build succeeds.

**Step 2: Verify tables are created**

Run: `sqlite3 workbench/data/workbench.db ".tables"` (or start the dev server and check)
Expected: `agent_lock`, `agent_tasks`, `agent_task_output` tables appear alongside existing tables.

**Step 3: Update PROGRESS.md**

Check off the three Phase 5a items in PROGRESS.md.
