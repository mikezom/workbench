import { describe, it, expect, beforeEach } from "vitest";
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
import type {
  MonitoringRecord,
  InvestigationReport,
  ActivityLogEntry,
} from "./monitor-db";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initAgentSchema(db);
  initMonitorSchema(db);
  return db;
}

/** Insert a minimal agent_task row and return its id. */
function insertTask(db: Database.Database, title = "Test task"): number {
  const result = db
    .prepare(
      `INSERT INTO agent_tasks (title, prompt, task_type) VALUES (?, ?, 'investigation')`
    )
    .run(title, "test prompt");
  return result.lastInsertRowid as number;
}

describe("monitor-db", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  // -------------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------------

  describe("initMonitorSchema", () => {
    it("should create the agent_monitoring table", () => {
      const row = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_monitoring'"
        )
        .get() as { name: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.name).toBe("agent_monitoring");
    });

    it("should create the investigation_reports table", () => {
      const row = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='investigation_reports'"
        )
        .get() as { name: string } | undefined;
      expect(row).toBeDefined();
    });

    it("should create the agent_activity_log table", () => {
      const row = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_activity_log'"
        )
        .get() as { name: string } | undefined;
      expect(row).toBeDefined();
    });

    it("should be idempotent (safe to call twice)", () => {
      expect(() => initMonitorSchema(db)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // agent_monitoring CRUD
  // -------------------------------------------------------------------------

  describe("createMonitoringRecord", () => {
    it("should create a monitoring record", () => {
      const taskId = insertTask(db);
      const record = createMonitoringRecord(db, {
        task_id: taskId,
        process_id: 12345,
        subprocess_pids: "12345,12346",
        current_phase: "developing",
        current_file: "src/index.ts",
        cpu_percent: 25.5,
        memory_mb: 128.0,
      });

      expect(record).toBeDefined();
      expect(record.task_id).toBe(taskId);
      expect(record.process_id).toBe(12345);
      expect(record.subprocess_pids).toBe("12345,12346");
      expect(record.current_phase).toBe("developing");
      expect(record.current_file).toBe("src/index.ts");
      expect(record.cpu_percent).toBe(25.5);
      expect(record.memory_mb).toBe(128.0);
      expect(record.started_at).toBeDefined();
      expect(record.last_updated).toBeDefined();
    });

    it("should enforce unique task_id", () => {
      const taskId = insertTask(db);
      createMonitoringRecord(db, {
        task_id: taskId,
        process_id: 111,
      });
      expect(() =>
        createMonitoringRecord(db, {
          task_id: taskId,
          process_id: 222,
        })
      ).toThrow();
    });

    it("should enforce foreign key to agent_tasks", () => {
      expect(() =>
        createMonitoringRecord(db, {
          task_id: 99999,
          process_id: 111,
        })
      ).toThrow();
    });
  });

  describe("getMonitoringRecord", () => {
    it("should retrieve a monitoring record by task_id", () => {
      const taskId = insertTask(db);
      createMonitoringRecord(db, {
        task_id: taskId,
        process_id: 12345,
        current_phase: "developing",
      });

      const record = getMonitoringRecord(db, taskId);
      expect(record).toBeDefined();
      expect(record!.task_id).toBe(taskId);
      expect(record!.process_id).toBe(12345);
    });

    it("should return null for non-existent task_id", () => {
      const record = getMonitoringRecord(db, 99999);
      expect(record).toBeNull();
    });
  });

  describe("deleteMonitoringRecord", () => {
    it("should delete a monitoring record", () => {
      const taskId = insertTask(db);
      createMonitoringRecord(db, {
        task_id: taskId,
        process_id: 12345,
      });

      const deleted = deleteMonitoringRecord(db, taskId);
      expect(deleted).toBe(true);

      const record = getMonitoringRecord(db, taskId);
      expect(record).toBeNull();
    });

    it("should return false for non-existent task_id", () => {
      const deleted = deleteMonitoringRecord(db, 99999);
      expect(deleted).toBe(false);
    });

    it("should cascade delete when parent task is deleted", () => {
      const taskId = insertTask(db);
      createMonitoringRecord(db, {
        task_id: taskId,
        process_id: 12345,
      });

      db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(taskId);

      const record = getMonitoringRecord(db, taskId);
      expect(record).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // investigation_reports CRUD
  // -------------------------------------------------------------------------

  describe("createInvestigationReport", () => {
    it("should create an investigation report", () => {
      const taskId = insertTask(db);
      const report = createInvestigationReport(db, {
        task_id: taskId,
        report_markdown: "# Investigation Report\n\nFindings here.",
      });

      expect(report).toBeDefined();
      expect(report.task_id).toBe(taskId);
      expect(report.report_markdown).toBe(
        "# Investigation Report\n\nFindings here."
      );
      expect(report.created_at).toBeDefined();
    });

    it("should enforce unique task_id", () => {
      const taskId = insertTask(db);
      createInvestigationReport(db, {
        task_id: taskId,
        report_markdown: "Report 1",
      });
      expect(() =>
        createInvestigationReport(db, {
          task_id: taskId,
          report_markdown: "Report 2",
        })
      ).toThrow();
    });

    it("should enforce foreign key to agent_tasks", () => {
      expect(() =>
        createInvestigationReport(db, {
          task_id: 99999,
          report_markdown: "Report",
        })
      ).toThrow();
    });
  });

  describe("getInvestigationReport", () => {
    it("should retrieve a report by task_id", () => {
      const taskId = insertTask(db);
      createInvestigationReport(db, {
        task_id: taskId,
        report_markdown: "# Report",
      });

      const report = getInvestigationReport(db, taskId);
      expect(report).toBeDefined();
      expect(report!.task_id).toBe(taskId);
      expect(report!.report_markdown).toBe("# Report");
    });

    it("should return null for non-existent task_id", () => {
      const report = getInvestigationReport(db, 99999);
      expect(report).toBeNull();
    });
  });

  describe("getAllInvestigationReports", () => {
    it("should return all reports with task titles", () => {
      const taskId1 = insertTask(db, "Task Alpha");
      const taskId2 = insertTask(db, "Task Beta");

      createInvestigationReport(db, {
        task_id: taskId1,
        report_markdown: "Report 1",
      });
      createInvestigationReport(db, {
        task_id: taskId2,
        report_markdown: "Report 2",
      });

      const reports = getAllInvestigationReports(db);
      expect(reports).toHaveLength(2);
      // Should include task_title from the JOIN
      expect(reports.some((r) => r.task_title === "Task Alpha")).toBe(true);
      expect(reports.some((r) => r.task_title === "Task Beta")).toBe(true);
    });

    it("should return empty array when no reports exist", () => {
      const reports = getAllInvestigationReports(db);
      expect(reports).toHaveLength(0);
    });

    it("should cascade delete when parent task is deleted", () => {
      const taskId = insertTask(db);
      createInvestigationReport(db, {
        task_id: taskId,
        report_markdown: "Report",
      });

      db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(taskId);

      const report = getInvestigationReport(db, taskId);
      expect(report).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // agent_activity_log CRUD
  // -------------------------------------------------------------------------

  describe("logActivity", () => {
    it("should log an activity entry", () => {
      const taskId = insertTask(db);
      const entry = logActivity(db, {
        task_id: taskId,
        activity_type: "file_read",
        details: "Read src/index.ts",
      });

      expect(entry).toBeDefined();
      expect(entry.task_id).toBe(taskId);
      expect(entry.activity_type).toBe("file_read");
      expect(entry.details).toBe("Read src/index.ts");
      expect(entry.timestamp).toBeDefined();
    });

    it("should accept all valid activity types", () => {
      const taskId = insertTask(db);
      const types = [
        "file_read",
        "file_write",
        "command",
        "phase_change",
        "process_start",
        "process_end",
      ] as const;

      for (const type of types) {
        expect(() =>
          logActivity(db, {
            task_id: taskId,
            activity_type: type,
            details: `Activity: ${type}`,
          })
        ).not.toThrow();
      }
    });

    it("should reject invalid activity types", () => {
      const taskId = insertTask(db);
      expect(() =>
        db
          .prepare(
            `INSERT INTO agent_activity_log (task_id, activity_type, details)
             VALUES (?, 'invalid_type', 'test')`
          )
          .run(taskId)
      ).toThrow();
    });

    it("should allow multiple entries for same task_id", () => {
      const taskId = insertTask(db);
      logActivity(db, {
        task_id: taskId,
        activity_type: "file_read",
        details: "Read file 1",
      });
      logActivity(db, {
        task_id: taskId,
        activity_type: "file_write",
        details: "Wrote file 2",
      });

      const log = getActivityLog(db, taskId);
      expect(log).toHaveLength(2);
    });

    it("should enforce foreign key to agent_tasks", () => {
      expect(() =>
        logActivity(db, {
          task_id: 99999,
          activity_type: "file_read",
          details: "test",
        })
      ).toThrow();
    });
  });

  describe("getActivityLog", () => {
    it("should retrieve activity log for a task ordered by timestamp", () => {
      const taskId = insertTask(db);
      logActivity(db, {
        task_id: taskId,
        activity_type: "process_start",
        details: "Started",
      });
      logActivity(db, {
        task_id: taskId,
        activity_type: "file_read",
        details: "Read file",
      });
      logActivity(db, {
        task_id: taskId,
        activity_type: "process_end",
        details: "Ended",
      });

      const log = getActivityLog(db, taskId);
      expect(log).toHaveLength(3);
      expect(log[0].activity_type).toBe("process_start");
      expect(log[2].activity_type).toBe("process_end");
    });

    it("should support limit and offset", () => {
      const taskId = insertTask(db);
      for (let i = 0; i < 5; i++) {
        logActivity(db, {
          task_id: taskId,
          activity_type: "file_read",
          details: `Entry ${i}`,
        });
      }

      const page1 = getActivityLog(db, taskId, { limit: 2 });
      expect(page1).toHaveLength(2);
      expect(page1[0].details).toBe("Entry 0");

      const page2 = getActivityLog(db, taskId, { limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      expect(page2[0].details).toBe("Entry 2");
    });

    it("should return empty array for non-existent task_id", () => {
      const log = getActivityLog(db, 99999);
      expect(log).toHaveLength(0);
    });

    it("should cascade delete when parent task is deleted", () => {
      const taskId = insertTask(db);
      logActivity(db, {
        task_id: taskId,
        activity_type: "file_read",
        details: "test",
      });

      db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(taskId);

      const log = getActivityLog(db, taskId);
      expect(log).toHaveLength(0);
    });
  });
});
