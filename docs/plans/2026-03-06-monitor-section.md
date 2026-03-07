# Monitor Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor agent-daemon.py with a task handler registry, add process monitoring, investigation tasks, and a new `/monitor` section UI.

**Architecture:** Extract each task type's polling/execution logic from agent-daemon.py into pluggable `TaskHandler` classes in a new `task_handlers.py`. Add a monitoring service that tracks running processes, a new `investigation` task type that produces markdown reports, and a `/monitor` Next.js page with three tabs (Active Agents, Task Queue, Reports).

**Tech Stack:** Python 3.9+ (daemon/executor), Next.js App Router (UI), SQLite via better-sqlite3 (TS) and sqlite3 (Python), Tailwind CSS (styling).

---

### Task 1: Database Schema — Add New Tables and Extend task_type

**Files:**
- Modify: `workbench/src/lib/agent-db.ts:8-71` (initAgentSchema)

**Context:** SQLite cannot alter CHECK constraints. From REFLECTION.md (2026-03-04), adding new enum values requires recreating the table. However, for the `task_type` column, we can use the same migration pattern: add the new tables and run a one-time migration to update the CHECK constraint.

For this task, we add the three new tables and update the `task_type` CHECK constraint. The `agent_tasks` table recreation is handled via an API migration endpoint (same pattern as decompose migration in `workbench/src/app/api/agent/migrate-decompose/route.ts`).

**Step 1: Write the failing test**

Create `workbench/src/lib/monitor-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initAgentSchema } from "./agent-db";
import {
  initMonitorSchema,
  createMonitoringRecord,
  getMonitoringRecord,
  deleteMonitoringRecord,
  createInvestigationReport,
  getInvestigationReport,
  getAllInvestigationReports,
  logActivity,
  getActivityLog,
} from "./monitor-db";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initAgentSchema(db);
  initMonitorSchema(db);
});

afterEach(() => {
  db.close();
});

function createTestTask(db: Database.Database, taskType = "worker"): number {
  const result = db
    .prepare(
      "INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)"
    )
    .run("Test task", "Do something", taskType);
  return result.lastInsertRowid as number;
}

describe("agent_monitoring table", () => {
  it("creates and retrieves a monitoring record", () => {
    const taskId = createTestTask(db);
    createMonitoringRecord(db, {
      task_id: taskId,
      process_id: 12345,
      current_phase: "understanding",
    });
    const record = getMonitoringRecord(db, taskId);
    expect(record).not.toBeNull();
    expect(record!.process_id).toBe(12345);
    expect(record!.current_phase).toBe("understanding");
  });

  it("deletes monitoring record", () => {
    const taskId = createTestTask(db);
    createMonitoringRecord(db, {
      task_id: taskId,
      process_id: 12345,
      current_phase: "understanding",
    });
    deleteMonitoringRecord(db, taskId);
    expect(getMonitoringRecord(db, taskId)).toBeNull();
  });

  it("enforces unique task_id", () => {
    const taskId = createTestTask(db);
    createMonitoringRecord(db, { task_id: taskId, process_id: 1 });
    expect(() =>
      createMonitoringRecord(db, { task_id: taskId, process_id: 2 })
    ).toThrow();
  });
});

describe("investigation_reports table", () => {
  it("creates and retrieves an investigation report", () => {
    const taskId = createTestTask(db, "investigation");
    createInvestigationReport(db, taskId, "# Report\n\nFindings here.");
    const report = getInvestigationReport(db, taskId);
    expect(report).not.toBeNull();
    expect(report!.report_markdown).toBe("# Report\n\nFindings here.");
  });

  it("lists all investigation reports", () => {
    const t1 = createTestTask(db, "investigation");
    const t2 = createTestTask(db, "investigation");
    createInvestigationReport(db, t1, "Report 1");
    createInvestigationReport(db, t2, "Report 2");
    const reports = getAllInvestigationReports(db);
    expect(reports).toHaveLength(2);
  });
});

describe("agent_activity_log table", () => {
  it("logs and retrieves activity", () => {
    const taskId = createTestTask(db);
    logActivity(db, taskId, "phase_change", { phase: "implementing" });
    logActivity(db, taskId, "file_write", { path: "src/app/page.tsx" });
    const logs = getActivityLog(db, taskId);
    expect(logs).toHaveLength(2);
    expect(JSON.parse(logs[0].details).phase).toBe("implementing");
  });

  it("returns activities in chronological order", () => {
    const taskId = createTestTask(db);
    logActivity(db, taskId, "phase_change", { phase: "understanding" });
    logActivity(db, taskId, "phase_change", { phase: "implementing" });
    const logs = getActivityLog(db, taskId);
    expect(JSON.parse(logs[0].details).phase).toBe("understanding");
    expect(JSON.parse(logs[1].details).phase).toBe("implementing");
  });
});

describe("investigation task_type", () => {
  it("allows creating tasks with task_type investigation", () => {
    const taskId = createTestTask(db, "investigation");
    const task = db
      .prepare("SELECT * FROM agent_tasks WHERE id = ?")
      .get(taskId) as { task_type: string };
    expect(task.task_type).toBe("investigation");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workbench && npx vitest run src/lib/monitor-db.test.ts`
Expected: FAIL — `monitor-db` module does not exist.

**Step 3: Write minimal implementation**

Create `workbench/src/lib/monitor-db.ts`:

```typescript
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initMonitorSchema(db: Database.Database): void {
  // Extend task_type CHECK to include 'investigation'
  // NOTE: This uses CREATE TABLE IF NOT EXISTS, so the CHECK constraint
  // on the existing agent_tasks table is NOT updated here. A migration
  // is needed for existing databases (see migrate-monitor route).
  // For fresh databases (and tests using :memory:), the initAgentSchema
  // runs first with the old CHECK, then we alter here.

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
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitoringRecord {
  id: number;
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
  id: number;
  task_id: number;
  report_markdown: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: number;
  task_id: number;
  timestamp: string;
  activity_type: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Monitoring CRUD
// ---------------------------------------------------------------------------

export function createMonitoringRecord(
  db: Database.Database,
  data: {
    task_id: number;
    process_id?: number;
    current_phase?: string;
  }
): void {
  db.prepare(
    `INSERT INTO agent_monitoring (task_id, process_id, current_phase)
     VALUES (?, ?, ?)`
  ).run(data.task_id, data.process_id ?? null, data.current_phase ?? null);
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
): void {
  db.prepare("DELETE FROM agent_monitoring WHERE task_id = ?").run(taskId);
}

// ---------------------------------------------------------------------------
// Investigation Reports CRUD
// ---------------------------------------------------------------------------

export function createInvestigationReport(
  db: Database.Database,
  taskId: number,
  reportMarkdown: string
): void {
  db.prepare(
    `INSERT INTO investigation_reports (task_id, report_markdown) VALUES (?, ?)`
  ).run(taskId, reportMarkdown);
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
): InvestigationReport[] {
  return db
    .prepare(
      `SELECT r.*, t.title as task_title
       FROM investigation_reports r
       JOIN agent_tasks t ON t.id = r.task_id
       ORDER BY r.created_at DESC`
    )
    .all() as InvestigationReport[];
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export function logActivity(
  db: Database.Database,
  taskId: number,
  activityType: string,
  details: Record<string, unknown>
): void {
  db.prepare(
    `INSERT INTO agent_activity_log (task_id, activity_type, details) VALUES (?, ?, ?)`
  ).run(taskId, activityType, JSON.stringify(details));
}

export function getActivityLog(
  db: Database.Database,
  taskId: number,
  limit = 50
): ActivityLogEntry[] {
  return db
    .prepare(
      `SELECT * FROM agent_activity_log
       WHERE task_id = ?
       ORDER BY timestamp ASC
       LIMIT ?`
    )
    .all(taskId, limit) as ActivityLogEntry[];
}
```

**Step 4: Update initAgentSchema to support 'investigation' task_type**

In `workbench/src/lib/agent-db.ts`, update the `task_type` CHECK constraint in the `CREATE TABLE IF NOT EXISTS` statement:

```typescript
// Change this line in initAgentSchema:
task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose')),
// To:
task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation')),
```

Also update the TypeScript type:

```typescript
// Change:
export type AgentTaskType = "worker" | "decompose";
// To:
export type AgentTaskType = "worker" | "decompose" | "investigation";
```

Call `initMonitorSchema` from `db.ts` where `initAgentSchema` is called.

**Step 5: Run test to verify it passes**

Run: `cd workbench && npx vitest run src/lib/monitor-db.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add workbench/src/lib/monitor-db.ts workbench/src/lib/monitor-db.test.ts workbench/src/lib/agent-db.ts workbench/src/lib/db.ts
git commit -m "feat: add monitor database schema and investigation task type"
```

---

### Task 2: Database Migration for Existing Databases

**Files:**
- Create: `workbench/src/app/api/monitor/migrate/route.ts`

**Context:** Existing databases have the old `task_type CHECK (task_type IN ('worker', 'decompose'))` constraint. SQLite requires table recreation to update CHECK constraints (see REFLECTION.md 2026-03-04). Follow the same pattern as `workbench/src/app/api/agent/migrate-decompose/route.ts`.

**Step 1: Write the migration route**

Create `workbench/src/app/api/monitor/migrate/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST() {
  try {
    const db = getDb();

    // Check if migration is needed by trying to insert a test value
    try {
      db.prepare(
        "INSERT INTO agent_tasks (title, prompt, task_type) VALUES ('__migrate_test__', '__test__', 'investigation')"
      ).run();
      // If it works, delete the test row and we're done
      db.prepare(
        "DELETE FROM agent_tasks WHERE title = '__migrate_test__'"
      ).run();

      // Still need to create new tables if they don't exist
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

      return NextResponse.json({ migrated: false, message: "Schema already up to date" });
    } catch {
      // CHECK constraint failed — need to recreate table
    }

    // Recreate agent_tasks with updated CHECK constraint
    const migrate = db.transaction(() => {
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

        INSERT INTO agent_tasks_new SELECT * FROM agent_tasks;
        DROP TABLE agent_tasks;
        ALTER TABLE agent_tasks_new RENAME TO agent_tasks;

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
    });
    migrate();

    return NextResponse.json({ migrated: true, message: "Schema migrated successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Test manually**

Run: `curl -X POST http://localhost:3000/api/monitor/migrate`
Expected: `{"migrated": true, "message": "Schema migrated successfully"}`

**Step 3: Commit**

```bash
git add workbench/src/app/api/monitor/migrate/route.ts
git commit -m "feat: add monitor schema migration endpoint"
```

---

### Task 3: Refactor Daemon — Extract Task Handlers

**Files:**
- Create: `workbench/scripts/task_handlers.py`
- Modify: `workbench/scripts/agent-daemon.py` (complete rewrite of main loop)

**Context:** The daemon currently has a 270-line main loop with deeply nested if/else chains. Each task type (worker new, worker resume, decompose start, decompose resume, decompose retry, decompose reflection) duplicates the same lock-acquire / status-update / try-except-finally / release-lock pattern. Extract each into a `TaskHandler` subclass.

**Step 1: Create task_handlers.py**

Create `workbench/scripts/task_handlers.py`:

```python
from __future__ import annotations

"""
Task handler registry for the agent daemon.

Each TaskHandler subclass encapsulates:
- How to find the next actionable task of its type (the SQL query)
- How to execute it (which pipeline function to call)
- What status transitions to apply on success, questions, or cancellation
"""

import json
import logging
import sqlite3
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from agent_executor import (
    execute_task as run_task_pipeline,
    resume_task as run_resume_pipeline,
    execute_decompose_task as run_decompose_pipeline,
    resume_decompose_task as run_decompose_resume_pipeline,
    retry_decompose_breakdown as run_decompose_retry_pipeline,
    execute_decompose_reflection as run_decompose_reflection_pipeline,
)

log = logging.getLogger("agent-daemon")


class TaskHandler(ABC):
    """Base class for task type handlers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for logging."""

    @abstractmethod
    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        """Find the next actionable task for this handler, or None."""

    @abstractmethod
    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        """Execute the task. May raise CancelledError or QuestionsAsked."""

    def get_developing_status(self) -> str:
        """Status to set when execution begins."""
        return "developing"

    def get_finished_status(self) -> str:
        """Status to set on successful completion."""
        return "finished"

    def get_questions_status(self) -> str:
        """Status to set when questions are asked."""
        return "waiting_for_review"

    def needs_started_at(self) -> bool:
        """Whether to set started_at when transitioning to developing."""
        return True


# ---------------------------------------------------------------------------
# Worker handlers
# ---------------------------------------------------------------------------


class WorkerNewTaskHandler(TaskHandler):
    """Picks up new development tasks (status = waiting_for_dev, type = worker)."""

    @property
    def name(self) -> str:
        return "worker-new"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND task_type = 'worker' "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_task_pipeline(conn, task)


class WorkerResumeHandler(TaskHandler):
    """Resumes worker tasks after all questions are answered."""

    @property
    def name(self) -> str:
        return "worker-resume"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT t.* FROM agent_tasks t
               WHERE t.task_type = 'worker'
               AND t.status = 'waiting_for_review'
               AND NOT EXISTS (
                 SELECT 1 FROM agent_task_questions q
                 WHERE q.task_id = t.id AND q.answer IS NULL
               )
               AND EXISTS (
                 SELECT 1 FROM agent_task_questions q2
                 WHERE q2.task_id = t.id
               )
               ORDER BY t.created_at ASC LIMIT 1"""
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_resume_pipeline(conn, task)

    def needs_started_at(self) -> bool:
        return False


# ---------------------------------------------------------------------------
# Decompose handlers
# ---------------------------------------------------------------------------


class DecomposeStartHandler(TaskHandler):
    """Picks up new decompose tasks (status = decompose_understanding)."""

    @property
    def name(self) -> str:
        return "decompose-start"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT * FROM agent_tasks
               WHERE task_type = 'decompose'
               AND status = 'decompose_understanding'
               ORDER BY created_at ASC LIMIT 1"""
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_understanding"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def get_questions_status(self) -> str:
        return "decompose_waiting_for_answers"


class DecomposeResumeHandler(TaskHandler):
    """Resumes decompose tasks after questions are answered."""

    @property
    def name(self) -> str:
        return "decompose-resume"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT t.* FROM agent_tasks t
               WHERE t.task_type = 'decompose'
               AND t.status = 'decompose_waiting_for_answers'
               AND NOT EXISTS (
                 SELECT 1 FROM agent_task_questions q
                 WHERE q.task_id = t.id AND q.answer IS NULL
               )
               AND EXISTS (
                 SELECT 1 FROM agent_task_questions q2
                 WHERE q2.task_id = t.id
               )
               ORDER BY t.created_at ASC LIMIT 1"""
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_resume_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_breaking_down"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def get_questions_status(self) -> str:
        return "decompose_waiting_for_answers"

    def needs_started_at(self) -> bool:
        return False


class DecomposeRetryHandler(TaskHandler):
    """Retries decompose breakdown after user rejection."""

    @property
    def name(self) -> str:
        return "decompose-retry"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT * FROM agent_tasks
               WHERE task_type = 'decompose'
               AND status = 'decompose_breaking_down'
               AND decompose_user_comment IS NOT NULL
               ORDER BY created_at ASC LIMIT 1"""
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        user_comment = task["decompose_user_comment"]
        run_decompose_retry_pipeline(conn, task, user_comment)

    def get_developing_status(self) -> str:
        # Don't change status — already decompose_breaking_down
        return "decompose_breaking_down"

    def get_finished_status(self) -> str:
        return "decompose_waiting_for_approval"

    def needs_started_at(self) -> bool:
        return False


class DecomposeReflectionHandler(TaskHandler):
    """Runs reflection on completed decompose tasks."""

    @property
    def name(self) -> str:
        return "decompose-reflection"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            """SELECT t.* FROM agent_tasks t
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
               ORDER BY t.created_at ASC LIMIT 1"""
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_decompose_reflection_pipeline(conn, task)

    def get_developing_status(self) -> str:
        return "decompose_reflecting"

    def get_finished_status(self) -> str:
        # Reflection has special post-processing — see daemon's
        # execute_with_handler for the reflection-specific logic
        return "decompose_complete"

    def needs_started_at(self) -> bool:
        return False
```

**Step 2: Rewrite agent-daemon.py**

Replace `workbench/scripts/agent-daemon.py` with:

```python
#!/usr/bin/env python3
from __future__ import annotations

"""
Agent polling daemon.

Polls SQLite for pending agent tasks, acquires a global lock,
executes them via registered task handlers,
and handles cancellation.

Run directly:  python3 scripts/agent-daemon.py
Or via launchd: launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
"""

import logging
import os
import signal
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

from agent_executor import CancelledError, QuestionsAsked
from task_handlers import (
    TaskHandler,
    WorkerNewTaskHandler,
    WorkerResumeHandler,
    DecomposeStartHandler,
    DecomposeResumeHandler,
    DecomposeRetryHandler,
    DecomposeReflectionHandler,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

POLL_INTERVAL = 5  # seconds between polls
STALE_LOCK_MINUTES = 30
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "workbench.db",
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("agent-daemon")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def is_locked(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT locked FROM agent_lock WHERE id = 1").fetchone()
    return bool(row and row["locked"])


def acquire_lock(conn: sqlite3.Connection, task_id: int) -> bool:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cur = conn.execute(
        "UPDATE agent_lock SET locked = 1, task_id = ?, locked_at = ? "
        "WHERE id = 1 AND locked = 0",
        (task_id, now),
    )
    conn.commit()
    return cur.rowcount > 0


def release_lock(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE agent_lock SET locked = 0, task_id = NULL, locked_at = NULL "
        "WHERE id = 1"
    )
    conn.commit()


def update_task_status(
    conn: sqlite3.Connection,
    task_id: int,
    status: str,
    *,
    started_at: str | None = None,
    completed_at: str | None = None,
    error_message: str | None = None,
) -> None:
    sets = ["status = ?"]
    values: list = [status]
    if started_at is not None:
        sets.append("started_at = ?")
        values.append(started_at)
    if completed_at is not None:
        sets.append("completed_at = ?")
        values.append(completed_at)
    if error_message is not None:
        sets.append("error_message = ?")
        values.append(error_message)
    values.append(task_id)
    conn.execute(
        f"UPDATE agent_tasks SET {', '.join(sets)} WHERE id = ?",
        values,
    )
    conn.commit()


def append_output(
    conn: sqlite3.Connection,
    task_id: int,
    output_type: str,
    content: str,
) -> None:
    conn.execute(
        "INSERT INTO agent_task_output (task_id, type, content) VALUES (?, ?, ?)",
        (task_id, output_type, content),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Stale lock recovery
# ---------------------------------------------------------------------------


def recover_stale_lock(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT locked, task_id, locked_at FROM agent_lock WHERE id = 1"
    ).fetchone()
    if not row or not row["locked"]:
        return

    locked_at_str = row["locked_at"]
    if locked_at_str is None:
        log.warning("Lock held with no locked_at timestamp — force-releasing")
        release_lock(conn)
        return

    try:
        locked_at = datetime.strptime(locked_at_str, "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        log.warning("Lock held with unparseable locked_at '%s' — force-releasing", locked_at_str)
        release_lock(conn)
        return

    age = datetime.now(timezone.utc) - locked_at
    if age > timedelta(minutes=STALE_LOCK_MINUTES):
        log.warning(
            "Stale lock detected (task_id=%s, locked %s ago) — force-releasing",
            row["task_id"], age,
        )
        if row["task_id"]:
            stale_task = conn.execute(
                "SELECT status FROM agent_tasks WHERE id = ?", (row["task_id"],)
            ).fetchone()
            if stale_task and stale_task["status"] == "developing":
                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                update_task_status(
                    conn, row["task_id"], "failed",
                    completed_at=now,
                    error_message="Daemon crashed while executing this task (stale lock recovered)",
                )
                log.warning("Marked stale task %s as failed", row["task_id"])
        release_lock(conn)


# ---------------------------------------------------------------------------
# Handler execution (shared logic)
# ---------------------------------------------------------------------------


def execute_with_handler(
    conn: sqlite3.Connection,
    handler: TaskHandler,
    task: dict,
) -> None:
    """Acquire lock, run handler, handle exceptions, release lock.

    This is the single place where lock management and error handling live.
    All task types flow through here.
    """
    task_id = task["id"]

    if not acquire_lock(conn, task_id):
        log.warning("Failed to acquire lock for %s task %d — skipping", handler.name, task_id)
        return

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    developing_status = handler.get_developing_status()
    kwargs = {}
    if handler.needs_started_at():
        kwargs["started_at"] = now
    update_task_status(conn, task_id, developing_status, **kwargs)
    log.info("[%s] Task %d: %s -> %s", handler.name, task_id, task["title"], developing_status)

    try:
        handler.execute(conn, task)

        # Special post-processing for decompose reflection
        if handler.name == "decompose-reflection":
            task_after = conn.execute(
                "SELECT decompose_user_comment FROM agent_tasks WHERE id = ?",
                (task_id,)
            ).fetchone()
            if task_after and task_after["decompose_user_comment"]:
                update_task_status(conn, task_id, "decompose_understanding")
                log.info("[%s] Task %d -> decompose_understanding (retry from reflection)", handler.name, task_id)
            else:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                update_task_status(conn, task_id, handler.get_finished_status(), completed_at=now)
                log.info("[%s] Task %d -> %s", handler.name, task_id, handler.get_finished_status())
        else:
            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            update_task_status(conn, task_id, handler.get_finished_status(), completed_at=now)
            log.info("[%s] Task %d -> %s", handler.name, task_id, handler.get_finished_status())

    except QuestionsAsked:
        update_task_status(conn, task_id, handler.get_questions_status())
        log.info("[%s] Task %d -> %s (questions)", handler.name, task_id, handler.get_questions_status())

    except CancelledError:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        update_task_status(conn, task_id, "cancelled", completed_at=now)
        log.info("[%s] Task %d -> cancelled", handler.name, task_id)

    except Exception:
        tb = traceback.format_exc()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        update_task_status(conn, task_id, "failed", completed_at=now, error_message=tb)
        log.error("[%s] Task %d failed:\n%s", handler.name, task_id, tb)
        append_output(conn, task_id, "system", f"Task failed: {tb}")

    finally:
        release_lock(conn)
        log.info("[%s] Lock released", handler.name)


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

running = True


def handle_signal(signum: int, _frame) -> None:
    global running
    sig_name = signal.Signals(signum).name
    log.info("Received %s — shutting down gracefully", sig_name)
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    global running

    log.info("Agent daemon starting (pid=%d)", os.getpid())
    log.info("DB path: %s", DB_PATH)
    log.info("Poll interval: %ds", POLL_INTERVAL)

    if not os.path.exists(DB_PATH):
        log.error("Database not found at %s — exiting", DB_PATH)
        sys.exit(1)

    conn = get_connection()
    recover_stale_lock(conn)

    # Register all task handlers in priority order
    handlers: list[TaskHandler] = [
        WorkerNewTaskHandler(),
        WorkerResumeHandler(),
        DecomposeStartHandler(),
        DecomposeResumeHandler(),
        DecomposeRetryHandler(),
        DecomposeReflectionHandler(),
    ]

    log.info("Registered %d task handlers: %s",
        len(handlers), ", ".join(h.name for h in handlers))
    log.info("Agent daemon ready — entering poll loop")

    while running:
        try:
            recover_stale_lock(conn)

            if not is_locked(conn):
                for handler in handlers:
                    task = handler.get_next_task(conn)
                    if task:
                        execute_with_handler(conn, handler, task)
                        break  # Only one task at a time

        except Exception:
            log.error("Unexpected error in poll loop:\n%s", traceback.format_exc())

        # Sleep in short intervals so we can respond to signals quickly
        for _ in range(POLL_INTERVAL):
            if not running:
                break
            time.sleep(1)

    conn.close()
    log.info("Agent daemon stopped")


if __name__ == "__main__":
    main()
```

**Step 3: Verify behavior is preserved**

Stop and restart the daemon:
```bash
launchctl unload ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
```

Check logs:
```bash
tail -20 /Users/ccnas/DEVELOPMENT/workbench/logs/agent-daemon.stderr.log
```

Expected: Daemon starts, registers 6 handlers, enters poll loop without errors.

**Step 4: Commit**

```bash
git add workbench/scripts/task_handlers.py workbench/scripts/agent-daemon.py
git commit -m "refactor: extract daemon task handlers into registry pattern"
```

---

### Task 4: Add Investigation Task Handler

**Files:**
- Modify: `workbench/scripts/task_handlers.py` (add InvestigationTaskHandler)
- Modify: `workbench/scripts/agent_executor.py` (add execute_investigation)
- Create: `workbench/data/agent-investigation-claude.md`
- Modify: `workbench/scripts/agent-daemon.py` (register investigation handler)

**Step 1: Create the investigation CLAUDE.md**

Create `workbench/data/agent-investigation-claude.md`:

```markdown
# Investigation Agent

You are a research and analysis agent. Your job is to investigate a question by reading code, searching the web, and reading documentation, then produce a structured markdown report.

## Rules

1. **Read-only**: Do NOT modify any files in the codebase. Do NOT create commits.
2. **No skills**: Do NOT load or invoke any skills.
3. **Report format**: Write your final report to `report.md` in the current directory.

## Report Structure

Write your report as a markdown file with this structure:

```
# [Title]

## Executive Summary
[2-3 sentence overview of findings]

## Findings

### [Topic 1]
[Details, code examples, evidence]

### [Topic 2]
[Details, code examples, evidence]

## Recommendations
[Actionable next steps based on findings]

## Sources
[URLs, file paths, documentation referenced]
```

## Guidelines

- Be thorough but concise
- Include code examples and file paths when referencing codebase findings
- Cite sources (URLs, file paths) for all claims
- Focus on actionable insights, not just description
- If the question is ambiguous, investigate the most likely interpretation rather than asking questions
```

**Step 2: Add execute_investigation to agent_executor.py**

Add at the end of `workbench/scripts/agent_executor.py`:

```python
# ---------------------------------------------------------------------------
# Investigation task execution
# ---------------------------------------------------------------------------

REPORT_FILE = "report.md"


def execute_investigation(conn: sqlite3.Connection, task: dict) -> None:
    """Execute an investigation task: research and produce a markdown report.

    Unlike worker tasks, investigations do NOT modify code, create commits,
    rebase, or merge. The output is a markdown report stored in the database.

    On success: stores report in investigation_reports, cleans up worktree.
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree, raises the original exception.
    """
    task_id = task["id"]
    prompt = task["prompt"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree (for CLAUDE.md isolation)
        append_output(conn, task_id, "system", "Starting investigation agent...")
        worktree_path, branch_name = create_worktree(
            REPO_ROOT, task_id, task.get("title") or f"investigate-{task_id}"
        )
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()

        # Step 2: Inject investigation CLAUDE.md
        inject_claude_md(worktree_path, "investigation")

        # Step 3: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 4: Extract report
        report_path = os.path.join(worktree_path, REPORT_FILE)
        if os.path.isfile(report_path):
            with open(report_path, "r", encoding="utf-8") as f:
                report_markdown = f.read()
        else:
            # Fallback: use the last assistant output as the report
            row = conn.execute(
                """SELECT content FROM agent_task_output
                   WHERE task_id = ? AND type = 'assistant'
                   ORDER BY timestamp DESC LIMIT 1""",
                (task_id,),
            ).fetchone()
            report_markdown = (
                row["content"] if row
                else "[Report extraction failed — no output found]"
            )
            append_output(conn, task_id, "system",
                "Warning: report.md not found, using raw output as report")

        # Step 5: Store report in database
        conn.execute(
            "INSERT INTO investigation_reports (task_id, report_markdown) VALUES (?, ?)",
            (task_id, report_markdown),
        )
        conn.commit()
        append_output(conn, task_id, "system",
            f"Investigation report stored ({len(report_markdown)} chars)")
        log.info("Investigation task %d complete, report stored", task_id)

        # Step 6: Clean up worktree (no merge needed)
        cleanup_worktree(REPO_ROOT, worktree_path, branch_name)

    except CancelledError:
        append_output(conn, task_id, "system", "Investigation cancelled — cleaning up")
        if worktree_path and branch_name:
            cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except Exception:
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Investigation failed — worktree preserved at {worktree_path}")
        raise
```

**Step 3: Add InvestigationTaskHandler to task_handlers.py**

Append to `workbench/scripts/task_handlers.py`:

```python
from agent_executor import execute_investigation as run_investigation_pipeline


class InvestigationTaskHandler(TaskHandler):
    """Picks up investigation tasks (status = waiting_for_dev, type = investigation)."""

    @property
    def name(self) -> str:
        return "investigation"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND task_type = 'investigation' "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        run_investigation_pipeline(conn, task)
```

**Step 4: Register in daemon**

In `workbench/scripts/agent-daemon.py`, add to the imports:

```python
from task_handlers import (
    # ... existing imports ...
    InvestigationTaskHandler,
)
```

And add to the handlers list:

```python
handlers: list[TaskHandler] = [
    WorkerNewTaskHandler(),
    WorkerResumeHandler(),
    DecomposeStartHandler(),
    DecomposeResumeHandler(),
    DecomposeRetryHandler(),
    DecomposeReflectionHandler(),
    InvestigationTaskHandler(),
]
```

**Step 5: Restart daemon and verify**

```bash
launchctl unload ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
tail -5 /Users/ccnas/DEVELOPMENT/workbench/logs/agent-daemon.stderr.log
```

Expected: Daemon logs "Registered 7 task handlers" including "investigation".

**Step 6: Commit**

```bash
git add workbench/scripts/task_handlers.py workbench/scripts/agent_executor.py workbench/scripts/agent-daemon.py workbench/data/agent-investigation-claude.md
git commit -m "feat: add investigation task type with executor and handler"
```

---

### Task 5: Monitor API Routes — Active Agents and Queue

**Files:**
- Create: `workbench/src/app/api/monitor/active/route.ts`
- Create: `workbench/src/app/api/monitor/queue/route.ts`
- Create: `workbench/src/app/api/monitor/terminate/[taskId]/route.ts`
- Create: `workbench/src/app/api/monitor/activity/[taskId]/route.ts`

**Step 1: Write tests for monitor API routes**

Create `workbench/src/app/api/monitor/active/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { GET } from "./route";
import { initAgentSchema } from "@/lib/agent-db";
import { initMonitorSchema } from "@/lib/monitor-db";

// Mock getDb to use in-memory database
let db: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initAgentSchema(db);
  initMonitorSchema(db);
});

afterEach(() => {
  db.close();
});

describe("GET /api/monitor/active", () => {
  it("returns empty array when no agents are active", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns active agent with monitoring data", async () => {
    // Create a developing task
    db.prepare(
      "INSERT INTO agent_tasks (title, prompt, status) VALUES (?, ?, ?)"
    ).run("Test task", "Do something", "developing");
    const taskId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };

    // Add monitoring record
    db.prepare(
      "INSERT INTO agent_monitoring (task_id, process_id, current_phase) VALUES (?, ?, ?)"
    ).run(taskId.id, 12345, "implementing");

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].task_id).toBe(taskId.id);
    expect(data[0].process_id).toBe(12345);
    expect(data[0].title).toBe("Test task");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workbench && npx vitest run src/app/api/monitor/active/route.test.ts`
Expected: FAIL — route module does not exist.

**Step 3: Implement the routes**

Create `workbench/src/app/api/monitor/active/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const rows = db
    .prepare(
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
    )
    .all();

  return NextResponse.json(rows);
}
```

Create `workbench/src/app/api/monitor/queue/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskType = searchParams.get("type");

  const db = getDb();

  let query = `
    SELECT id, title, status, task_type, created_at, started_at, completed_at,
           error_message, parent_task_id
    FROM agent_tasks
  `;
  const params: string[] = [];

  if (taskType && taskType !== "all") {
    query += " WHERE task_type = ?";
    params.push(taskType);
  }

  query += " ORDER BY created_at DESC LIMIT 100";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}
```

Create `workbench/src/app/api/monitor/terminate/[taskId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId: taskIdStr } = await params;
  const taskId = parseInt(taskIdStr, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const db = getDb();

  // Get monitoring record for process ID
  const monitoring = db
    .prepare("SELECT process_id FROM agent_monitoring WHERE task_id = ?")
    .get(taskId) as { process_id: number | null } | undefined;

  // Mark the task as cancelled — the daemon's cancellation check will pick this up
  db.prepare("UPDATE agent_tasks SET status = 'cancelled' WHERE id = ?").run(
    taskId
  );

  return NextResponse.json({
    cancelled: true,
    task_id: taskId,
    process_id: monitoring?.process_id ?? null,
    message: monitoring?.process_id
      ? "Task marked as cancelled. Agent will be terminated on next check."
      : "Task marked as cancelled (no active process found).",
  });
}
```

Create `workbench/src/app/api/monitor/activity/[taskId]/route.ts`:

```typescript
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
  const rows = db
    .prepare(
      `SELECT * FROM agent_activity_log
       WHERE task_id = ?
       ORDER BY timestamp DESC
       LIMIT 50`
    )
    .all(taskId);

  return NextResponse.json(rows);
}
```

**Step 4: Run tests**

Run: `cd workbench && npx vitest run src/app/api/monitor/active/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workbench/src/app/api/monitor/
git commit -m "feat: add monitor API routes for active agents, queue, terminate, activity"
```

---

### Task 6: Investigation API Routes

**Files:**
- Create: `workbench/src/app/api/investigation/create/route.ts`
- Create: `workbench/src/app/api/investigation/reports/route.ts`
- Create: `workbench/src/app/api/investigation/reports/[taskId]/route.ts`

**Step 1: Write tests**

Create `workbench/src/app/api/investigation/create/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { POST } from "./route";
import { initAgentSchema } from "@/lib/agent-db";
import { initMonitorSchema } from "@/lib/monitor-db";

let db: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initAgentSchema(db);
  initMonitorSchema(db);
});

afterEach(() => {
  db.close();
});

describe("POST /api/investigation/create", () => {
  it("creates an investigation task", async () => {
    const res = await POST(
      new Request("http://localhost/api/investigation/create", {
        method: "POST",
        body: JSON.stringify({
          title: "Research WebSocket patterns",
          prompt: "What are the best practices for WebSocket reconnection?",
        }),
        headers: { "Content-Type": "application/json" },
      })
    );

    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.task_type).toBe("investigation");
    expect(data.status).toBe("waiting_for_dev");
    expect(data.title).toBe("Research WebSocket patterns");
  });

  it("returns 400 for missing title", async () => {
    const res = await POST(
      new Request("http://localhost/api/investigation/create", {
        method: "POST",
        body: JSON.stringify({ prompt: "something" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workbench && npx vitest run src/app/api/investigation/create/route.test.ts`
Expected: FAIL

**Step 3: Implement the routes**

Create `workbench/src/app/api/investigation/create/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createTask } from "@/lib/agent-db";

export async function POST(request: Request) {
  const body = await request.json();
  const { title, prompt } = body;

  if (!title || !prompt) {
    return NextResponse.json(
      { error: "title and prompt are required" },
      { status: 400 }
    );
  }

  const task = createTask({
    title,
    prompt,
    task_type: "investigation",
  });

  return NextResponse.json(task, { status: 201 });
}
```

Create `workbench/src/app/api/investigation/reports/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.task_id, r.created_at, t.title, t.status
       FROM investigation_reports r
       JOIN agent_tasks t ON t.id = r.task_id
       ORDER BY r.created_at DESC`
    )
    .all();

  return NextResponse.json(rows);
}
```

Create `workbench/src/app/api/investigation/reports/[taskId]/route.ts`:

```typescript
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
  const report = db
    .prepare(
      `SELECT r.*, t.title, t.prompt, t.status, t.created_at as task_created_at
       FROM investigation_reports r
       JOIN agent_tasks t ON t.id = r.task_id
       WHERE r.task_id = ?`
    )
    .get(taskId);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
```

**Step 4: Run tests**

Run: `cd workbench && npx vitest run src/app/api/investigation/create/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add workbench/src/app/api/investigation/
git commit -m "feat: add investigation API routes for create and reports"
```

---

### Task 7: Monitor Section UI — Page Shell and Navigation

**Files:**
- Create: `workbench/src/app/monitor/page.tsx`
- Modify: `workbench/src/components/nav.tsx:8-63` (add Monitor section)

**Step 1: Add Monitor to navigation**

In `workbench/src/components/nav.tsx`, add a new entry to the `sections` array after Agent:

```typescript
{
  href: "/monitor",
  label: "Monitor",
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
    </svg>
  ),
},
```

**Step 2: Create the monitor page shell**

Create `workbench/src/app/monitor/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import PageContainer from "@/components/page-container";

type Tab = "active" | "queue" | "reports";

export default function MonitorPage() {
  const [activeTab, setActiveTab] = useState<Tab>("active");

  const tabs: { id: Tab; label: string }[] = [
    { id: "active", label: "Active Agents" },
    { id: "queue", label: "Task Queue" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-[var(--color-heading)]">
          Monitor
        </h1>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "active" && <ActiveAgentsTab />}
        {activeTab === "queue" && <TaskQueueTab />}
        {activeTab === "reports" && <ReportsTab />}
      </div>
    </PageContainer>
  );
}

function ActiveAgentsTab() {
  return (
    <div className="text-[var(--color-muted)] text-center py-12">
      Active Agents tab — coming next
    </div>
  );
}

function TaskQueueTab() {
  return (
    <div className="text-[var(--color-muted)] text-center py-12">
      Task Queue tab — coming next
    </div>
  );
}

function ReportsTab() {
  return (
    <div className="text-[var(--color-muted)] text-center py-12">
      Reports tab — coming next
    </div>
  );
}
```

**Step 3: Verify in browser**

Run: `cd workbench && npm run dev`
Navigate to `http://localhost:3000/monitor`
Expected: Page loads with 3 tabs, each showing placeholder text.

**Step 4: Run build to check for errors**

Run: `cd workbench && npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add workbench/src/app/monitor/page.tsx workbench/src/components/nav.tsx
git commit -m "feat: add monitor section page shell with tabs and navigation"
```

---

### Task 8: Monitor UI — Active Agents Tab

**Files:**
- Modify: `workbench/src/app/monitor/page.tsx` (replace ActiveAgentsTab placeholder)

**Step 1: Implement ActiveAgentsTab**

Replace the `ActiveAgentsTab` function in `workbench/src/app/monitor/page.tsx`:

```typescript
function ActiveAgentsTab() {
  const [agents, setAgents] = useState<ActiveAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor/active");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 3000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const handleTerminate = async (taskId: number) => {
    if (!confirm("Terminate this agent?")) return;
    await fetch(`/api/monitor/terminate/${taskId}`, { method: "POST" });
    fetchAgents();
  };

  if (loading) {
    return <div className="text-[var(--color-muted)] text-center py-12">Loading...</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="text-[var(--color-muted)] text-center py-12">
        No agents currently active
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {agents.map((agent) => (
        <div
          key={agent.task_id}
          className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)]"
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-[var(--color-heading)]">
                Task #{agent.task_id}: {agent.title}
              </h3>
              <div className="flex gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  {agent.task_type}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  {agent.current_phase || agent.status}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleTerminate(agent.task_id)}
              className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              Terminate
            </button>
          </div>

          {(agent.process_id || agent.cpu_percent !== null) && (
            <div className="text-xs text-[var(--color-muted)] mb-2 flex gap-4">
              {agent.process_id && <span>PID: {agent.process_id}</span>}
              {agent.cpu_percent !== null && <span>CPU: {agent.cpu_percent?.toFixed(1)}%</span>}
              {agent.memory_mb !== null && <span>Memory: {agent.memory_mb?.toFixed(0)} MB</span>}
              {agent.current_file && <span>File: {agent.current_file}</span>}
            </div>
          )}

          {agent.started_at && (
            <div className="text-xs text-[var(--color-muted)]">
              Running since: {new Date(agent.started_at).toLocaleTimeString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

Add the types at the top of the file:

```typescript
interface ActiveAgent {
  task_id: number;
  title: string;
  status: string;
  task_type: string;
  started_at: string | null;
  prompt: string;
  process_id: number | null;
  subprocess_pids: string | null;
  current_phase: string | null;
  current_file: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  monitor_started_at: string | null;
  last_updated: string | null;
}
```

Add missing imports: `useEffect`, `useCallback`.

**Step 2: Verify in browser**

Navigate to `http://localhost:3000/monitor` with the Active Agents tab selected.
Expected: Shows "No agents currently active" or active agents if any are running.

**Step 3: Run build**

Run: `cd workbench && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add workbench/src/app/monitor/page.tsx
git commit -m "feat: implement Active Agents tab with real-time monitoring"
```

---

### Task 9: Monitor UI — Task Queue Tab

**Files:**
- Modify: `workbench/src/app/monitor/page.tsx` (replace TaskQueueTab placeholder)

**Step 1: Implement TaskQueueTab**

Replace the `TaskQueueTab` function:

```typescript
function TaskQueueTab() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    try {
      const url = filter === "all"
        ? "/api/monitor/queue"
        : `/api/monitor/queue?type=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        setTasks(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const filters = [
    { value: "all", label: "All" },
    { value: "worker", label: "Development" },
    { value: "investigation", label: "Investigation" },
    { value: "decompose", label: "Decompose" },
  ];

  const queued = tasks.filter((t) =>
    ["waiting_for_dev", "decompose_understanding", "decompose_approved"].includes(t.status)
  );
  const inProgress = tasks.filter((t) =>
    ["developing", "decompose_breaking_down", "decompose_reflecting",
     "waiting_for_review", "decompose_waiting_for_answers",
     "decompose_waiting_for_approval", "decompose_waiting_for_completion"].includes(t.status)
  );
  const completed = tasks.filter((t) =>
    ["finished", "decompose_complete"].includes(t.status)
  );
  const failed = tasks.filter((t) =>
    ["failed", "cancelled"].includes(t.status)
  );

  if (loading) {
    return <div className="text-[var(--color-muted)] text-center py-12">Loading...</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              filter === f.value
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-hover)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sections */}
      <QueueSection title="Queued" tasks={queued} />
      <QueueSection title="In Progress" tasks={inProgress} />
      <QueueSection title="Completed" tasks={completed} />
      <QueueSection title="Failed / Cancelled" tasks={failed} />
    </div>
  );
}

function QueueSection({ title, tasks }: { title: string; tasks: QueueTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-[var(--color-muted)] mb-2">
        {title} ({tasks.length})
      </h3>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-sm"
          >
            <span className="text-[var(--color-muted)] font-mono text-xs">#{task.id}</span>
            <TypeBadge type={task.task_type} />
            <span className="flex-1 text-[var(--color-text)] truncate">{task.title}</span>
            <StatusBadge status={task.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    worker: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    investigation: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
    decompose: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300",
  };
  const labels: Record<string, string> = {
    worker: "Dev",
    investigation: "Inv",
    decompose: "Dec",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[type] ?? ""}`}>
      {labels[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const short = status
    .replace("decompose_", "")
    .replace("waiting_for_", "wait:")
    .replace("_", " ");
  return (
    <span className="text-xs text-[var(--color-muted)]">{short}</span>
  );
}
```

Add the type at the top:

```typescript
interface QueueTask {
  id: number;
  title: string;
  status: string;
  task_type: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  parent_task_id: number | null;
}
```

**Step 2: Verify in browser and build**

Run: `cd workbench && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add workbench/src/app/monitor/page.tsx
git commit -m "feat: implement Task Queue tab with type filters"
```

---

### Task 10: Monitor UI — Reports Tab with Investigation Form

**Files:**
- Modify: `workbench/src/app/monitor/page.tsx` (replace ReportsTab placeholder)

**Step 1: Implement ReportsTab**

Replace the `ReportsTab` function:

```typescript
function ReportsTab() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedReport, setSelectedReport] = useState<FullReport | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/investigation/reports");
      if (res.ok) {
        setReports(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const viewReport = async (taskId: number) => {
    const res = await fetch(`/api/investigation/reports/${taskId}`);
    if (res.ok) {
      setSelectedReport(await res.json());
    }
  };

  const submitInvestigation = async (title: string, prompt: string) => {
    const res = await fetch("/api/investigation/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, prompt }),
    });
    if (res.ok) {
      setShowForm(false);
      fetchReports();
    }
  };

  if (selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    );
  }

  if (loading) {
    return <div className="text-[var(--color-muted)] text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-[var(--color-muted)]">
          Investigation Reports ({reports.length})
        </h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm rounded bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          + New Investigation
        </button>
      </div>

      {showForm && (
        <InvestigationForm
          onSubmit={submitInvestigation}
          onCancel={() => setShowForm(false)}
        />
      )}

      {reports.length === 0 && !showForm && (
        <div className="text-[var(--color-muted)] text-center py-12">
          No investigation reports yet. Start one with the button above.
        </div>
      )}

      <div className="space-y-2">
        {reports.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between px-4 py-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <div>
              <div className="font-medium text-[var(--color-text)]">{r.title}</div>
              <div className="text-xs text-[var(--color-muted)]">
                Task #{r.task_id} &middot; {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => viewReport(r.task_id)}
              className="px-3 py-1 text-sm rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors"
            >
              View Report
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestigationForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, prompt: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4 mb-4 bg-[var(--color-surface)]">
      <h4 className="font-medium mb-3 text-[var(--color-heading)]">
        New Investigation
      </h4>
      <input
        type="text"
        placeholder="Title (e.g., 'Research WebSocket best practices')"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 mb-3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm"
      />
      <textarea
        placeholder="What should the agent investigate? Be specific about what you want to know."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 mb-3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-sm resize-y"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (title.trim() && prompt.trim()) onSubmit(title, prompt);
          }}
          disabled={!title.trim() || !prompt.trim()}
          className="px-3 py-1.5 text-sm rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function ReportViewer({
  report,
  onClose,
}: {
  report: FullReport;
  onClose: () => void;
}) {
  return (
    <div>
      <button
        onClick={onClose}
        className="mb-4 text-sm text-[var(--color-accent)] hover:underline"
      >
        &larr; Back to reports
      </button>
      <div className="border border-[var(--color-border)] rounded-lg p-6 bg-[var(--color-surface)]">
        <h2 className="text-xl font-bold mb-2 text-[var(--color-heading)]">
          {report.title}
        </h2>
        <div className="text-xs text-[var(--color-muted)] mb-6">
          Task #{report.task_id} &middot;{" "}
          {new Date(report.created_at).toLocaleString()}
        </div>
        <div
          className="prose dark:prose-invert max-w-none text-[var(--color-text)]"
          dangerouslySetInnerHTML={{ __html: report.report_markdown }}
        />
      </div>
    </div>
  );
}
```

Add the types at the top:

```typescript
interface ReportSummary {
  id: number;
  task_id: number;
  title: string;
  status: string;
  created_at: string;
}

interface FullReport {
  id: number;
  task_id: number;
  title: string;
  prompt: string;
  status: string;
  report_markdown: string;
  created_at: string;
  task_created_at: string;
}
```

**Note:** The `dangerouslySetInnerHTML` for the report viewer is a placeholder. For proper markdown rendering, install `react-markdown` and `remark-gfm` in a follow-up, or use the raw markdown with a `<pre>` block initially. For the first pass, render the raw markdown in a `<pre>` tag:

```typescript
<pre className="whitespace-pre-wrap text-sm font-mono text-[var(--color-text)]">
  {report.report_markdown}
</pre>
```

**Step 2: Verify in browser and build**

Run: `cd workbench && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add workbench/src/app/monitor/page.tsx
git commit -m "feat: implement Reports tab with investigation form and report viewer"
```

---

### Task 11: Wire initMonitorSchema into Database Initialization

**Files:**
- Modify: `workbench/src/lib/db.ts` (call initMonitorSchema after initAgentSchema)

**Step 1: Update db.ts**

In the `getDb()` function (or wherever `initAgentSchema` is called), add:

```typescript
import { initMonitorSchema } from "./monitor-db";

// After initAgentSchema(db):
initMonitorSchema(db);
```

**Step 2: Run full test suite**

Run: `cd workbench && npm test`
Expected: All tests pass.

**Step 3: Run build**

Run: `cd workbench && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add workbench/src/lib/db.ts
git commit -m "feat: wire monitor schema initialization into database setup"
```

---

### Task 12: Full Integration Test

**Step 1: Run full test suite**

Run: `cd workbench && npm test && npm run build`
Expected: All tests pass, build succeeds.

**Step 2: Run database migration on real database**

Run: `curl -X POST http://localhost:3000/api/monitor/migrate`
Expected: `{"migrated": true, "message": "Schema migrated successfully"}`

**Step 3: Restart daemon and verify**

```bash
launchctl unload ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
tail -10 /Users/ccnas/DEVELOPMENT/workbench/logs/agent-daemon.stderr.log
```

Expected: Daemon starts with 7 handlers registered.

**Step 4: Test investigation flow manually**

1. Navigate to `http://localhost:3000/monitor`
2. Click Reports tab
3. Click "+ New Investigation"
4. Enter title: "Test investigation"
5. Enter prompt: "List all API routes in this project and briefly describe what each one does."
6. Click Submit
7. Switch to Active Agents tab — should show the investigation running after daemon picks it up
8. Switch to Task Queue tab — should show the investigation task
9. Wait for completion, switch to Reports tab — should show the report

**Step 5: Commit any fixes discovered during integration testing**

```bash
git add -A
git commit -m "fix: integration test fixes for monitor section"
```
