#!/usr/bin/env node
/**
 * Migration: Update agent_tasks status CHECK constraint to include decompose statuses
 *
 * SQLite doesn't allow modifying CHECK constraints, so we need to:
 * 1. Create a new table with the correct schema
 * 2. Copy all data
 * 3. Drop the old table
 * 4. Rename the new table
 */

import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(__dirname, "../data/workbench.db");

function migrate() {
  const db = new Database(DB_PATH);

  console.log("Starting migration: Update agent_tasks status CHECK constraint");

  try {
    db.exec("BEGIN TRANSACTION");

    // 1. Create new table with updated CHECK constraint
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
        task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose')),
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
      )
    `);

    // 2. Copy all data from old table to new table
    db.exec(`
      INSERT INTO agent_tasks_new
        (id, title, prompt, status, parent_objective, parent_task_id, task_type,
         branch_name, worktree_path, error_message, commit_id,
         decompose_breakdown, decompose_user_comment, user_task_comment,
         created_at, started_at, completed_at)
      SELECT
        id, title, prompt, status, parent_objective, parent_task_id, task_type,
        branch_name, worktree_path, error_message, commit_id,
        decompose_breakdown, decompose_user_comment, user_task_comment,
        created_at, started_at, completed_at
      FROM agent_tasks
    `);

    // 3. Drop old table
    db.exec("DROP TABLE agent_tasks");

    // 4. Rename new table
    db.exec("ALTER TABLE agent_tasks_new RENAME TO agent_tasks");

    db.exec("COMMIT");

    console.log("✓ Migration completed successfully");
    console.log("  - Updated status CHECK constraint to include decompose statuses");

  } catch (error) {
    db.exec("ROLLBACK");
    console.error("✗ Migration failed:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
