import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { createTask, getAllTasks, getTask, appendTaskOutput, getTaskOutput, updateTask } from "@/lib/agent-db";

describe("interactive-study sessions API logic", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM agent_task_output");
    db.exec("DELETE FROM agent_tasks");
  });

  it("creates a session (task with interactive-study type)", () => {
    const task = createTask({
      title: "Studying Category Theory",
      prompt: "I want to learn about category theory",
      task_type: "interactive-study",
    });
    expect(task.id).toBeDefined();
    expect(task.task_type).toBe("interactive-study");
    expect(task.status).toBe("waiting_for_dev");
  });

  it("lists only interactive-study sessions", () => {
    createTask({ title: "Study 1", prompt: "topic", task_type: "interactive-study" });
    createTask({ title: "Worker", prompt: "build", task_type: "worker" });
    createTask({ title: "Study 2", prompt: "topic2", task_type: "interactive-study" });

    const all = getAllTasks();
    const sessions = all.filter((t) => t.task_type === "interactive-study");
    expect(sessions).toHaveLength(2);
  });

  it("sends a user message and triggers developing status", () => {
    const task = createTask({
      title: "Study",
      prompt: "category theory",
      task_type: "interactive-study",
    });

    // Simulate user sending a message
    appendTaskOutput(task.id, "user", "What is a functor?");
    updateTask(task.id, { status: "developing" });

    const updated = getTask(task.id);
    expect(updated!.status).toBe("developing");

    const output = getTaskOutput(task.id);
    const userMessages = output.filter((o) => o.type === "user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe("What is a functor?");
  });

  it("retrieves messages with since parameter", () => {
    const task = createTask({
      title: "Study",
      prompt: "topic",
      task_type: "interactive-study",
    });

    appendTaskOutput(task.id, "user", "Message 1");
    appendTaskOutput(task.id, "assistant", "Response 1");
    appendTaskOutput(task.id, "user", "Message 2");

    // Get all messages
    const all = getTaskOutput(task.id);
    expect(all).toHaveLength(3);

    // Get messages after the first one (using offset)
    const newer = getTaskOutput(task.id, { offset: 1 });
    expect(newer.length).toBeGreaterThanOrEqual(2);
  });

  it("deletes a session", () => {
    const task = createTask({
      title: "Study",
      prompt: "topic",
      task_type: "interactive-study",
    });
    appendTaskOutput(task.id, "user", "test");

    const db = getDb();
    db.prepare("DELETE FROM agent_tasks WHERE id = ?").run(task.id);

    const deleted = getTask(task.id);
    expect(deleted).toBeNull();

    // Cascade should delete outputs too
    const output = getTaskOutput(task.id);
    expect(output).toHaveLength(0);
  });
});
