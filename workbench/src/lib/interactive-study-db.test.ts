import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
import { createTask, getAllTasks, updateTask, appendTaskOutput, getTaskOutput } from "./agent-db";

describe("interactive-study task type", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM agent_task_output");
    db.exec("DELETE FROM agent_tasks");
  });

  it("creates a task with task_type interactive-study", () => {
    const task = createTask({
      title: "Study Category Theory",
      prompt: "Let's study category theory",
      task_type: "interactive-study",
    });
    expect(task.task_type).toBe("interactive-study");
    expect(task.status).toBe("waiting_for_dev");
  });

  it("retrieves interactive-study tasks", () => {
    createTask({
      title: "Study Session 1",
      prompt: "topic",
      task_type: "interactive-study",
    });
    createTask({
      title: "Worker Task",
      prompt: "build something",
      task_type: "worker",
    });

    const all = getAllTasks();
    const studyTasks = all.filter((t) => t.task_type === "interactive-study");
    expect(studyTasks).toHaveLength(1);
    expect(studyTasks[0].title).toBe("Study Session 1");
  });

  it("stores user and assistant messages in task output", () => {
    const task = createTask({
      title: "Study",
      prompt: "topic",
      task_type: "interactive-study",
    });

    appendTaskOutput(task.id, "user", "Explain monads");
    appendTaskOutput(task.id, "assistant", "A monad is a monoid in the category of endofunctors...");

    const output = getTaskOutput(task.id);
    expect(output).toHaveLength(2);
    expect(output[0].type).toBe("user");
    expect(output[0].content).toBe("Explain monads");
    expect(output[1].type).toBe("assistant");
  });

  it("updates task status for message flow", () => {
    const task = createTask({
      title: "Study",
      prompt: "topic",
      task_type: "interactive-study",
    });
    expect(task.status).toBe("waiting_for_dev");

    // User sends message → status becomes developing
    const updated = updateTask(task.id, { status: "developing" });
    expect(updated!.status).toBe("developing");

    // Agent responds → status back to waiting_for_dev
    const done = updateTask(task.id, { status: "waiting_for_dev" });
    expect(done!.status).toBe("waiting_for_dev");
  });
});
