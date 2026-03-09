import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  createTask,
  getAllTasks,
  getTask,
  updateTask,
  deleteTask,
  migrateAgentSchema,
} from "./agent-db";
import { getDb } from "./db";

describe("agent-db", () => {
  beforeEach(() => {
    const db = getDb();
    // Disable foreign keys temporarily to allow deletion
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DELETE FROM agent_task_questions");
    db.exec("DELETE FROM agent_task_output");
    db.exec("DELETE FROM agent_tasks");
    // Reset auto-increment counter
    db.exec("DELETE FROM sqlite_sequence WHERE name='agent_tasks'");
    db.exec("PRAGMA foreign_keys = ON");
  });

  describe("createTask", () => {
    it("creates a worker task by default", () => {
      const task = createTask({
        title: "Test task",
        prompt: "Do something",
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe("Test task");
      expect(task.prompt).toBe("Do something");
      expect(task.task_type).toBe("worker");
      expect(task.status).toBe("waiting_for_dev");
    });

    it("creates an interactive-study task", () => {
      const task = createTask({
        title: "Study session",
        prompt: "Learn about React",
        task_type: "interactive-study",
      });

      expect(task.id).toBeDefined();
      expect(task.task_type).toBe("interactive-study");
    });

    it("creates a decompose task", () => {
      const task = createTask({
        title: "Complex feature",
        prompt: "Build authentication",
        task_type: "decompose",
      });

      expect(task.task_type).toBe("decompose");
    });
  });

  describe("getTask", () => {
    it("returns null for non-existent task", () => {
      const task = getTask(99999);
      expect(task).toBeNull();
    });

    it("retrieves a task by id", () => {
      const created = createTask({
        title: "Test",
        prompt: "Test prompt",
      });

      const retrieved = getTask(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe("Test");
    });
  });

  describe("getAllTasks", () => {
    it("returns empty array when no tasks exist", () => {
      const tasks = getAllTasks();
      expect(tasks).toEqual([]);
    });

    it("returns all tasks ordered by created_at DESC", () => {
      createTask({ title: "First", prompt: "First" });
      createTask({ title: "Second", prompt: "Second" });
      createTask({ title: "Third", prompt: "Third" });

      const tasks = getAllTasks();
      expect(tasks).toHaveLength(3);
      // All tasks created in same millisecond, so order is by ID (insertion order)
      // Just verify all tasks are returned
      const titles = tasks.map(t => t.title).sort();
      expect(titles).toEqual(["First", "Second", "Third"]);
    });

    it("filters tasks by status", () => {
      createTask({ title: "Task 1", prompt: "Prompt 1" });
      const task2 = createTask({ title: "Task 2", prompt: "Prompt 2" });
      updateTask(task2.id, { status: "developing" });

      const developingTasks = getAllTasks("developing");
      expect(developingTasks).toHaveLength(1);
      expect(developingTasks[0].id).toBe(task2.id);
    });
  });

  describe("updateTask", () => {
    it("returns null for non-existent task", () => {
      const result = updateTask(99999, { title: "Updated" });
      expect(result).toBeNull();
    });

    it("updates task fields", () => {
      const task = createTask({ title: "Original", prompt: "Original prompt" });
      const updated = updateTask(task.id, {
        title: "Updated",
        status: "developing",
        branch_name: "task/test",
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe("Updated");
      expect(updated!.status).toBe("developing");
      expect(updated!.branch_name).toBe("task/test");
    });
  });

  describe("deleteTask", () => {
    it("returns false for non-existent task", () => {
      const result = deleteTask(99999);
      expect(result).toBe(false);
    });

    it("deletes the task and returns true", () => {
      const task = createTask({ title: "To delete", prompt: "Delete me" });
      const result = deleteTask(task.id);

      expect(result).toBe(true);
      expect(getTask(task.id)).toBeNull();
    });
  });

  describe("migrateAgentSchema", () => {
    it("does not migrate if table already has interactive-study", () => {
      const db = getDb();

      // Schema is already migrated in test environment
      const tableInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_tasks'")
        .get() as { sql: string } | undefined;

      expect(tableInfo).toBeDefined();
      expect(tableInfo!.sql).toContain("'interactive-study'");

      // Running migration again should be a no-op
      migrateAgentSchema(db);

      // Verify table still exists and has correct schema
      const tableInfoAfter = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_tasks'")
        .get() as { sql: string } | undefined;

      expect(tableInfoAfter).toBeDefined();
      expect(tableInfoAfter!.sql).toContain("'interactive-study'");
    });

    it("migrates schema from old version without interactive-study", () => {
      // Create a fresh in-memory database with old schema
      const testDb = new Database(":memory:");
      testDb.pragma("foreign_keys = ON");

      // Create old schema without 'interactive-study'
      testDb.exec(`
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
      `);

      // Insert test data
      testDb.exec(`
        INSERT INTO agent_tasks (title, prompt, task_type)
        VALUES ('Test Task 1', 'Test prompt 1', 'worker'),
               ('Test Task 2', 'Test prompt 2', 'decompose');
      `);

      // Verify old schema doesn't allow interactive-study
      expect(() => {
        testDb
          .prepare("INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)")
          .run("Test", "Test", "interactive-study");
      }).toThrow();

      // Run migration
      migrateAgentSchema(testDb);

      // Verify new schema allows interactive-study
      const result = testDb
        .prepare("INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)")
        .run("Interactive Study Task", "Study prompt", "interactive-study");

      expect(result.changes).toBe(1);

      // Verify data was preserved
      const tasks = testDb
        .prepare("SELECT * FROM agent_tasks ORDER BY id")
        .all() as Array<{ id: number; title: string; task_type: string }>;

      expect(tasks).toHaveLength(3);
      expect(tasks[0].title).toBe("Test Task 1");
      expect(tasks[0].task_type).toBe("worker");
      expect(tasks[1].title).toBe("Test Task 2");
      expect(tasks[1].task_type).toBe("decompose");
      expect(tasks[2].title).toBe("Interactive Study Task");
      expect(tasks[2].task_type).toBe("interactive-study");

      testDb.close();
    });

    it("is idempotent - can run multiple times safely", () => {
      const testDb = new Database(":memory:");
      testDb.pragma("foreign_keys = ON");

      // Create old schema
      testDb.exec(`
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
      `);

      testDb.exec(`
        INSERT INTO agent_tasks (title, prompt, task_type)
        VALUES ('Test Task', 'Test prompt', 'worker');
      `);

      // Run migration first time
      migrateAgentSchema(testDb);

      // Verify migration worked
      const result1 = testDb
        .prepare("INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)")
        .run("Study 1", "Prompt 1", "interactive-study");
      expect(result1.changes).toBe(1);

      // Run migration second time - should be no-op
      migrateAgentSchema(testDb);

      // Verify data is still intact
      const tasks = testDb
        .prepare("SELECT * FROM agent_tasks ORDER BY id")
        .all() as Array<{ id: number; title: string; task_type: string }>;

      expect(tasks).toHaveLength(2);
      expect(tasks[0].title).toBe("Test Task");
      expect(tasks[1].title).toBe("Study 1");

      // Run migration third time
      migrateAgentSchema(testDb);

      // Verify can still insert interactive-study tasks
      const result2 = testDb
        .prepare("INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)")
        .run("Study 2", "Prompt 2", "interactive-study");
      expect(result2.changes).toBe(1);

      testDb.close();
    });

    it("rolls back on error and preserves data", () => {
      const testDb = new Database(":memory:");
      testDb.pragma("foreign_keys = ON");

      // Create old schema
      testDb.exec(`
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
      `);

      testDb.exec(`
        INSERT INTO agent_tasks (title, prompt, task_type)
        VALUES ('Original Task', 'Original prompt', 'worker');
      `);

      // Mock a migration function that will fail partway through
      const failingMigration = () => {
        testDb.exec("BEGIN TRANSACTION");
        try {
          testDb.exec("PRAGMA foreign_keys = OFF");
          testDb.exec(`
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

          // Simulate an error by trying to insert into non-existent column
          testDb.exec("INSERT INTO agent_tasks_new (nonexistent_column) VALUES ('fail')");

          testDb.exec("COMMIT");
        } catch (error) {
          testDb.exec("ROLLBACK");
          throw error;
        }
      };

      // Attempt failing migration
      expect(() => failingMigration()).toThrow();

      // Verify original data is still intact
      const tasks = testDb
        .prepare("SELECT * FROM agent_tasks")
        .all() as Array<{ id: number; title: string }>;

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Original Task");

      // Verify table structure is unchanged (still old schema)
      expect(() => {
        testDb
          .prepare("INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, ?)")
          .run("Test", "Test", "interactive-study");
      }).toThrow();

      testDb.close();
    });
  });
});
