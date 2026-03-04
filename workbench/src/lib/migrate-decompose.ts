import { getDb } from "./db";

/**
 * Migration: Add decompose agent support to agent_tasks table
 *
 * Adds:
 * - parent_task_id: Links sub-tasks to their parent decompose task
 * - task_type: Distinguishes between 'worker' and 'decompose' tasks
 * - decompose_breakdown: Stores the breakdown JSON
 * - decompose_user_comment: Stores user's rejection comment on breakdown
 * - user_task_comment: Stores user's comment on completed task (for reflection)
 * - New statuses for decompose workflow
 */
export function migrateDecomposeSupport(): void {
  const db = getDb();

  // Check if migration is needed
  const tableInfo = db.pragma("table_info(agent_tasks)") as Array<{
    name: string;
  }>;
  const hasParentTaskId = tableInfo.some((col) => col.name === "parent_task_id");

  if (hasParentTaskId) {
    console.log("Decompose migration already applied, skipping.");
    return;
  }

  console.log("Applying decompose migration...");

  db.exec(`
    -- Add new columns
    ALTER TABLE agent_tasks ADD COLUMN parent_task_id INTEGER REFERENCES agent_tasks(id) ON DELETE SET NULL;
    ALTER TABLE agent_tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose'));
    ALTER TABLE agent_tasks ADD COLUMN decompose_breakdown TEXT;
    ALTER TABLE agent_tasks ADD COLUMN decompose_user_comment TEXT;
    ALTER TABLE agent_tasks ADD COLUMN user_task_comment TEXT;
  `);

  // Note: SQLite doesn't support modifying CHECK constraints on existing columns
  // The new statuses will be enforced in the application layer
  // Future tasks will use the updated schema from initAgentSchema()

  console.log("Decompose migration complete.");
}
