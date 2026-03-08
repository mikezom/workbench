# Interactive Study Section — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a chat-based Socratic learning interface that reuses the Agentic Tasks pipeline, with sessions, LaTeX rendering, and avatar support.

**Architecture:** Extends the existing agent task system with a new `interactive-study` task type. Each study session is an `agent_task` row. User/agent messages are stored in `agent_task_output`. The daemon picks up sessions in `developing` status, loads conversation history, invokes Claude CLI, streams the response, then sets status back to `waiting_for_dev` (ready for next user message). The UI is a chat interface with a session sidebar, not a task board.

**Tech Stack:** Next.js 14 (App Router), better-sqlite3, Python daemon, Claude CLI, KaTeX, Tailwind CSS, Vitest

**Design Doc:** `workbench/docs/plans/2026-03-08-interactive-study-design.md`

---

## Task 1: Install KaTeX dependency

**Files:**
- Modify: `workbench/package.json`

**Step 1: Install KaTeX**

Run: `cd workbench/workbench && npm install katex`

**Step 2: Verify installation**

Run: `cd workbench/workbench && node -e "require('katex'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
cd workbench
git add workbench/package.json workbench/package-lock.json
git commit -m "feat: install katex dependency for interactive study"
```

---

## Task 2: Database schema — add `interactive-study` task type

**Files:**
- Modify: `workbench/workbench/src/lib/agent-db.ts` (lines 15-26, the CHECK constraints)

**Step 1: Write the failing test**

Create: `workbench/workbench/src/lib/interactive-study-db.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
import { createTask, getTask, getAllTasks, updateTask, appendTaskOutput, getTaskOutput } from "./agent-db";

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
```

**Step 2: Run test to verify it fails**

Run: `cd workbench/workbench && npx vitest run src/lib/interactive-study-db.test.ts`
Expected: FAIL — `CHECK constraint failed` because `interactive-study` is not in the allowed task_type values.

**Step 3: Update the schema CHECK constraint**

In `workbench/workbench/src/lib/agent-db.ts`, change line 25:

```typescript
// Before:
      task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation')),

// After:
      task_type TEXT NOT NULL DEFAULT 'worker' CHECK (task_type IN ('worker', 'decompose', 'investigation', 'interactive-study')),
```

Also update `createTask` function to accept the new task_type. Find the `createTask` function and ensure the `task_type` parameter accepts `'interactive-study'`.

Find the TypeScript type definition for task_type (likely a union type) and add `'interactive-study'` to it.

**Step 4: Run test to verify it passes**

Run: `cd workbench/workbench && npx vitest run src/lib/interactive-study-db.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Migrate the live database**

The live database at `workbench/workbench/data/workbench.db` was created with the old CHECK constraint. SQLite doesn't support `ALTER TABLE ... ALTER COLUMN`, so we need to update the constraint. The simplest approach: the schema uses `CREATE TABLE IF NOT EXISTS`, so we need to run an ALTER to drop and recreate the constraint.

Actually, since `better-sqlite3` uses `CREATE TABLE IF NOT EXISTS`, the existing table won't be modified. We need a migration:

```sql
-- Check if migration is needed (task_type constraint doesn't include interactive-study)
-- If the table already exists with old constraint, we need to recreate it
-- SQLite migration: create new table, copy data, drop old, rename
```

Add a migration function in `agent-db.ts` that runs after `initAgentSchema`:

```typescript
export function migrateAgentSchema(db: Database.Database): void {
  // Add interactive-study to task_type if not already present
  // Test by trying to insert and catching constraint error
  try {
    const stmt = db.prepare(
      "INSERT INTO agent_tasks (title, prompt, task_type) VALUES ('__migration_test__', '__test__', 'interactive-study')"
    );
    stmt.run();
    // Clean up test row
    db.exec("DELETE FROM agent_tasks WHERE title = '__migration_test__'");
  } catch {
    // Constraint doesn't allow interactive-study — need to recreate table
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

      INSERT INTO agent_tasks_new SELECT * FROM agent_tasks;

      DROP TABLE agent_tasks;

      ALTER TABLE agent_tasks_new RENAME TO agent_tasks;
    `);
  }
}
```

Call `migrateAgentSchema(db)` in `db.ts` after `initAgentSchema(db)`.

**Step 6: Run tests again to confirm**

Run: `cd workbench/workbench && npx vitest run src/lib/interactive-study-db.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
cd workbench
git add workbench/src/lib/agent-db.ts workbench/src/lib/db.ts workbench/src/lib/interactive-study-db.test.ts
git commit -m "feat: add interactive-study task type to database schema"
```

---

## Task 3: Exclude `interactive-study` from Worker handler

**Files:**
- Modify: `workbench/workbench/scripts/task_handlers.py` (line 87-89)

**Step 1: Update the SQL query in WorkerNewTaskHandler**

In `task_handlers.py`, change `WorkerNewTaskHandler.get_next_task` (line 86-93):

```python
# Before:
    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND (task_type IS NULL OR task_type NOT IN ('decompose', 'investigation')) "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()

# After:
    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'waiting_for_dev' "
            "AND (task_type IS NULL OR task_type NOT IN ('decompose', 'investigation', 'interactive-study')) "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
```

**Step 2: Verify manually**

The daemon should now skip interactive-study tasks in the worker handler. We'll test this integration later.

**Step 3: Commit**

```bash
cd workbench
git add workbench/scripts/task_handlers.py
git commit -m "fix: exclude interactive-study tasks from worker handler"
```

---

## Task 4: Create interactive-study executor function

**Files:**
- Modify: `workbench/workbench/scripts/agent_executor.py` (add new function at end)

**Step 1: Write the executor function**

Add to the end of `agent_executor.py` (before the final blank line), after the `execute_investigation` function:

```python
# ---------------------------------------------------------------------------
# Interactive Study executor
# ---------------------------------------------------------------------------


def execute_interactive_study(conn: sqlite3.Connection, task: dict) -> None:
    """Execute one turn of an interactive study conversation.

    Unlike worker tasks, interactive study tasks:
    1. Don't create worktrees (no code changes)
    2. Load full conversation history from agent_task_output
    3. Build a prompt with conversation context
    4. Invoke Claude CLI with the conversation
    5. Store response in agent_task_output
    6. Do NOT finish — status goes back to waiting_for_dev

    The daemon sets status to 'developing' before calling this.
    After this returns, the daemon sets status to 'waiting_for_dev'.
    """
    task_id = task["id"]

    append_output(conn, task_id, "system", "Processing study response...")

    # Step 1: Load conversation history from agent_task_output
    rows = conn.execute(
        "SELECT type, content FROM agent_task_output "
        "WHERE task_id = ? AND type IN ('user', 'assistant') "
        "ORDER BY id ASC",
        (task_id,),
    ).fetchall()

    # Step 2: Build conversation prompt
    # Format as a conversation transcript for Claude
    conversation_parts = []
    for row in rows:
        role = "User" if row["type"] == "user" else "Assistant"
        conversation_parts.append(f"{role}: {row['content']}")

    conversation_text = "\n\n".join(conversation_parts)

    # The task prompt contains the study topic/context
    topic = task.get("prompt") or task.get("title") or "general study"

    prompt = (
        f"You are a Socratic tutor. The study topic is: {topic}\n\n"
        f"Here is the conversation so far:\n\n{conversation_text}\n\n"
        f"Continue the conversation. Respond to the user's latest message. "
        f"Guide them with questions rather than just giving answers. "
        f"Use LaTeX notation ($...$ for inline, $$...$$ for block) when writing math."
    )

    # Step 3: Create a temporary directory for Claude CLI execution
    # Interactive study doesn't need a worktree, but Claude CLI needs a cwd
    import tempfile
    with tempfile.TemporaryDirectory(prefix="study-") as tmpdir:
        # Inject the interactive-study CLAUDE.md
        inject_claude_md(tmpdir, "interactive-study")

        # Step 4: Invoke Claude CLI
        try:
            invoke_claude(tmpdir, prompt, conn, task_id)
        except CancelledError:
            append_output(conn, task_id, "system", "Study session cancelled")
            raise
        except RuntimeError as e:
            append_output(conn, task_id, "system", f"Claude CLI error: {e}")
            raise

    append_output(conn, task_id, "system", "Response complete — ready for next message")
    log.info("Interactive study task %d turn complete", task_id)
```

**Step 2: Verify syntax**

Run: `cd workbench/workbench/scripts && python3 -c "import agent_executor; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
cd workbench
git add workbench/scripts/agent_executor.py
git commit -m "feat: add interactive study executor function"
```

---

## Task 5: Create interactive-study task handler

**Files:**
- Modify: `workbench/workbench/scripts/task_handlers.py` (add new handler class)
- Modify: `workbench/workbench/scripts/agent-daemon.py` (register handler)

**Step 1: Add InteractiveStudyHandler to task_handlers.py**

Add at the end of `task_handlers.py`:

```python
# ---------------------------------------------------------------------------
# Interactive Study handler
# ---------------------------------------------------------------------------


class InteractiveStudyHandler(TaskHandler):
    """Handles interactive study conversation turns.

    Picks up interactive-study tasks that are in 'developing' status
    (set by the API when user sends a message).
    After execution, status goes back to 'waiting_for_dev'.
    """

    @property
    def name(self) -> str:
        return "interactive-study"

    def get_next_task(self, conn: sqlite3.Connection) -> dict | None:
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE status = 'developing' "
            "AND task_type = 'interactive-study' "
            "ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None

    def execute(self, conn: sqlite3.Connection, task: dict) -> None:
        from agent_executor import execute_interactive_study
        execute_interactive_study(conn, task)

    def get_developing_status(self) -> str:
        return "developing"

    def get_finished_status(self) -> str:
        return "waiting_for_dev"  # Ready for next user message

    def supports_questions(self) -> bool:
        return False

    def needs_started_at(self) -> bool:
        return False
```

**Step 2: Add the import and register handler in agent-daemon.py**

In `agent-daemon.py`, add to the imports (line 26-34):

```python
from task_handlers import (
    TaskHandler,
    WorkerNewTaskHandler,
    WorkerResumeHandler,
    DecomposeStartHandler,
    DecomposeResumeHandler,
    DecomposeRetryHandler,
    DecomposeReflectionHandler,
    InvestigationTaskHandler,
    InteractiveStudyHandler,
)
```

Add to the handlers list (line 312-320):

```python
    handlers: list[TaskHandler] = [
        InteractiveStudyHandler(),  # Check first — fast response needed
        WorkerNewTaskHandler(),
        WorkerResumeHandler(),
        DecomposeStartHandler(),
        DecomposeResumeHandler(),
        DecomposeRetryHandler(),
        DecomposeReflectionHandler(),
        InvestigationTaskHandler(),
    ]
```

Note: `InteractiveStudyHandler` is placed first because study sessions need fast response times and it only matches `developing` + `interactive-study` so it won't interfere with other handlers.

**Step 3: Verify imports**

Run: `cd workbench/workbench/scripts && python3 -c "from task_handlers import InteractiveStudyHandler; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
cd workbench
git add workbench/scripts/task_handlers.py workbench/scripts/agent-daemon.py
git commit -m "feat: add interactive study task handler and register in daemon"
```

---

## Task 6: Create agent config files for interactive-study

**Files:**
- Create: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/CLAUDE.md`
- Create: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/config.json`

**Step 1: Create the directory**

Run: `mkdir -p /Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study`

**Step 2: Create CLAUDE.md**

Create `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/CLAUDE.md`:

```markdown
# Interactive Study Agent

You are a Socratic tutor. Your goal is to help the user deeply understand topics through guided questioning and dialogue.

## Approach

- **Ask questions** rather than lecturing. Guide the user to discover answers themselves.
- **Build on what they know.** Start from their current understanding and extend it.
- **Use examples.** Concrete examples before abstract definitions.
- **Check understanding.** Ask the user to explain concepts back in their own words.
- **Correct gently.** When the user is wrong, ask clarifying questions rather than directly correcting.

## Formatting

- Use LaTeX for mathematical notation: `$...$` for inline math, `$$...$$` for display math.
- Use markdown for structure (headers, lists, bold/italic).
- Keep responses focused — one idea at a time.
- Keep responses concise — 2-4 paragraphs max per turn.

## Conversation Flow

1. Start by asking what the user wants to study or what they already know
2. Present concepts incrementally with guiding questions
3. After each concept, check understanding before moving on
4. Summarize key points periodically
5. Suggest related topics to explore next
```

**Step 3: Create config.json**

Create `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/config.json`:

```json
{
  "model": "sonnet",
  "max_turns": 1,
  "agent_avatar": "/avatars/study-agent.svg",
  "user_avatar": null
}
```

**Step 4: Verify files exist**

Run: `ls -la /Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/`
Expected: `CLAUDE.md` and `config.json` listed

**Step 5: Commit**

Note: These files are outside the workbench git repo (in `shared-data/`), so they won't be committed to git. That's by design — agent configs are stored separately.

---

## Task 7: API Routes — Session CRUD

**Files:**
- Create: `workbench/workbench/src/app/api/interactive-study/sessions/route.ts`
- Create: `workbench/workbench/src/app/api/interactive-study/sessions/[id]/route.ts`
- Create: `workbench/workbench/src/app/api/interactive-study/sessions/[id]/messages/route.ts`

**Step 1: Write API tests**

Create: `workbench/workbench/src/app/api/interactive-study/sessions/route.test.ts`

```typescript
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
    db.exec(`DELETE FROM agent_tasks WHERE id = ${task.id}`);

    const deleted = getTask(task.id);
    expect(deleted).toBeNull();

    // Cascade should delete outputs too
    const output = getTaskOutput(task.id);
    expect(output).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it passes (if schema task from Task 2 is done)**

Run: `cd workbench/workbench && npx vitest run src/app/api/interactive-study/sessions/route.test.ts`
Expected: PASS

**Step 3: Create the sessions list/create route**

Create `workbench/workbench/src/app/api/interactive-study/sessions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createTask, getAllTasks } from "@/lib/agent-db";

export function GET() {
  const allTasks = getAllTasks();
  const sessions = allTasks.filter((t) => t.task_type === "interactive-study");
  // Sort newest first
  sessions.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, topic } = body;

  const sessionTitle = title?.trim() || `Study Session — ${new Date().toLocaleDateString()}`;
  const prompt = topic?.trim() || "";

  const task = createTask({
    title: sessionTitle,
    prompt: prompt,
    task_type: "interactive-study",
  });

  return NextResponse.json(task, { status: 201 });
}
```

**Step 4: Create the session detail route**

Create `workbench/workbench/src/app/api/interactive-study/sessions/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, deleteTask } from "@/lib/agent-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task || task.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existing = getTask(id);
  if (!existing || existing.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await req.json();
  const task = updateTask(id, body);
  return NextResponse.json(task);
}

export function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const existing = getTask(id);
  if (!existing || existing.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  deleteTask(id);
  return NextResponse.json({ ok: true });
}
```

**Step 5: Create the messages route**

Create `workbench/workbench/src/app/api/interactive-study/sessions/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTask, updateTask, appendTaskOutput, getTaskOutput } from "@/lib/agent-db";

export function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task || task.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sinceId = Number(req.nextUrl.searchParams.get("since")) || 0;
  const output = getTaskOutput(id);

  // Filter to only chat messages (user + assistant), optionally after sinceId
  const messages = output
    .filter((o) => o.type === "user" || o.type === "assistant")
    .filter((o) => sinceId ? o.id > sinceId : true);

  return NextResponse.json({
    messages,
    status: task.status,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task || task.task_type !== "interactive-study") {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Prevent sending while agent is processing
  if (task.status === "developing") {
    return NextResponse.json(
      { error: "Agent is still responding. Please wait." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 }
    );
  }

  // Store user message
  appendTaskOutput(id, "user", content);

  // Trigger daemon by setting status to developing
  updateTask(id, { status: "developing" });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

**Step 6: Verify all tests pass**

Run: `cd workbench/workbench && npx vitest run src/app/api/interactive-study`
Expected: PASS

**Step 7: Commit**

```bash
cd workbench
git add workbench/src/app/api/interactive-study/
git commit -m "feat: add interactive study API routes (sessions + messages)"
```

---

## Task 8: LaTeX renderer component

**Files:**
- Create: `workbench/workbench/src/components/latex-renderer.tsx`
- Create: `workbench/workbench/src/components/latex-renderer.test.tsx`

**Step 1: Write the failing test**

Create `workbench/workbench/src/components/latex-renderer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LatexRenderer } from "./latex-renderer";

// Note: KaTeX rendering in happy-dom may not produce full HTML,
// but we can test that the component renders without crashing

describe("LatexRenderer", () => {
  it("renders plain text without modification", () => {
    const { container } = render(<LatexRenderer content="Hello world" />);
    expect(container.textContent).toContain("Hello world");
  });

  it("renders without crashing on inline LaTeX", () => {
    const { container } = render(
      <LatexRenderer content="The formula $x^2$ is quadratic" />
    );
    expect(container.textContent).toContain("The formula");
    expect(container.textContent).toContain("is quadratic");
  });

  it("renders without crashing on block LaTeX", () => {
    const { container } = render(
      <LatexRenderer content="Below is the equation:\n$$E = mc^2$$\nAbove was Einstein's equation." />
    );
    expect(container.textContent).toContain("Below is the equation:");
  });

  it("handles invalid LaTeX gracefully", () => {
    // Should not throw, should show raw LaTeX or error indicator
    const { container } = render(
      <LatexRenderer content="Bad math: $\\invalid{$ end" />
    );
    expect(container.textContent).toBeTruthy();
  });

  it("renders markdown formatting", () => {
    const { container } = render(
      <LatexRenderer content="**bold** and *italic*" />
    );
    expect(container.textContent).toContain("bold");
    expect(container.textContent).toContain("italic");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd workbench/workbench && npx vitest run src/components/latex-renderer.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the LatexRenderer component**

Create `workbench/workbench/src/components/latex-renderer.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import katex from "katex";

/**
 * Renders text content with LaTeX math expressions.
 *
 * Supports:
 * - Inline math: $...$ (rendered inline)
 * - Block math: $$...$$ (rendered as centered block)
 * - Basic markdown: **bold**, *italic*, `code`, \n for line breaks
 *
 * Invalid LaTeX is shown as raw text with a red underline.
 */
export function LatexRenderer({ content }: { content: string }) {
  const rendered = useMemo(() => renderContent(content), [content]);

  return (
    <div
      className="latex-content"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

function renderContent(text: string): string {
  // Step 1: Escape HTML entities
  let html = escapeHtml(text);

  // Step 2: Process block LaTeX ($$...$$) first
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, latex) => {
    return renderKatex(unescapeHtml(latex), true);
  });

  // Step 3: Process inline LaTeX ($...$)
  // Avoid matching $$ (already processed) or currency like $5
  html = html.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_match, latex) => {
    return renderKatex(unescapeHtml(latex), false);
  });

  // Step 4: Basic markdown
  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="bg-neutral-100 dark:bg-neutral-800 rounded p-3 my-2 overflow-x-auto text-sm"><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-neutral-100 dark:bg-neutral-800 rounded px-1.5 py-0.5 text-sm">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br />");

  return html;
}

function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      errorColor: "#ef4444",
      trust: false,
    });
  } catch {
    // Fallback: show raw LaTeX with error styling
    const escaped = escapeHtml(latex);
    const wrapper = displayMode ? "div" : "span";
    return `<${wrapper} class="text-red-500 underline decoration-wavy" title="LaTeX parse error">${displayMode ? "$$" : "$"}${escaped}${displayMode ? "$$" : "$"}</${wrapper}>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
```

**Step 4: Add KaTeX CSS import**

We need KaTeX's CSS for proper rendering. Add to `workbench/workbench/src/app/layout.tsx`:

```typescript
import "katex/dist/katex.min.css";
```

Add this import near the top of the file, with the other CSS imports.

**Step 5: Run test to verify it passes**

Run: `cd workbench/workbench && npx vitest run src/components/latex-renderer.test.tsx`
Expected: PASS (or most tests pass — KaTeX rendering may be limited in happy-dom)

**Step 6: Commit**

```bash
cd workbench
git add workbench/src/components/latex-renderer.tsx workbench/src/components/latex-renderer.test.tsx workbench/src/app/layout.tsx
git commit -m "feat: add LaTeX renderer component with KaTeX"
```

---

## Task 9: Chat UI components — MessageBubble

**Files:**
- Create: `workbench/workbench/src/components/study/message-bubble.tsx`

**Step 1: Create the MessageBubble component**

Create `workbench/workbench/src/components/study/message-bubble.tsx`:

```tsx
"use client";

import { LatexRenderer } from "@/components/latex-renderer";

interface MessageBubbleProps {
  type: "user" | "assistant";
  content: string;
  agentAvatar?: string;
  userAvatar?: string;
}

export function MessageBubble({
  type,
  content,
  agentAvatar,
  userAvatar,
}: MessageBubbleProps) {
  const isUser = type === "user";

  const avatarSrc = isUser ? userAvatar : agentAvatar;
  const fallbackInitial = isUser ? "U" : "A";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4`}
    >
      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={isUser ? "User" : "Agent"}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initial on load error
              (e.target as HTMLImageElement).style.display = "none";
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <span
          className={`text-xs font-medium text-neutral-500 dark:text-neutral-400 ${avatarSrc ? "hidden" : ""}`}
        >
          {fallbackInitial}
        </span>
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-blue-500 text-white rounded-br-md"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-bl-md"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="text-sm">
            <LatexRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd workbench
git add workbench/src/components/study/message-bubble.tsx
git commit -m "feat: add MessageBubble component for study chat"
```

---

## Task 10: Chat UI components — ChatInterface and SessionSidebar

**Files:**
- Create: `workbench/workbench/src/components/study/chat-interface.tsx`
- Create: `workbench/workbench/src/components/study/session-sidebar.tsx`

**Step 1: Create SessionSidebar**

Create `workbench/workbench/src/components/study/session-sidebar.tsx`:

```tsx
"use client";

interface Session {
  id: number;
  title: string;
  status: string;
  created_at: string;
}

interface SessionSidebarProps {
  sessions: Session[];
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SessionSidebarProps) {
  return (
    <div className="w-60 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={onNewSession}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sessions.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 p-3 text-center">
            No sessions yet
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 px-3 py-2.5 cursor-pointer border-b border-neutral-100 dark:border-neutral-800/50 transition-colors ${
                session.id === activeSessionId
                  ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800/30 border-l-2 border-l-transparent"
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {session.title}
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {new Date(session.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Status dot */}
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  session.status === "developing"
                    ? "bg-blue-400 animate-pulse"
                    : session.status === "failed"
                    ? "bg-red-400"
                    : "bg-green-400"
                }`}
              />

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-all text-xs p-0.5"
                title="Delete session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create ChatInterface**

Create `workbench/workbench/src/components/study/chat-interface.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "./message-bubble";

interface Message {
  id: number;
  type: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatInterfaceProps {
  sessionId: number | null;
  sessionStatus: string;
  messages: Message[];
  onSendMessage: (content: string) => void;
}

export function ChatInterface({
  sessionId,
  sessionStatus,
  messages,
  onSendMessage,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProcessing = sessionStatus === "developing";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing || !sessionId) return;
    onSendMessage(trimmed);
    setInput("");
  }, [input, isProcessing, sessionId, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500">
        <div className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto mb-4 opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-lg font-medium">Interactive Study</p>
          <p className="text-sm mt-1">Create a new session to start learning</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {messages.length === 0 && !isProcessing ? (
          <div className="text-center text-neutral-400 dark:text-neutral-500 mt-20">
            <p className="text-sm">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              type={msg.type as "user" | "assistant"}
              content={msg.content}
            />
          ))
        )}

        {/* Typing indicator */}
        {isProcessing && (
          <div className="flex gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">A</span>
            </div>
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isProcessing ? "Waiting for response..." : "Type your message..."}
            disabled={isProcessing}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 custom-scrollbar"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="shrink-0 w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:hover:bg-blue-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
cd workbench
git add workbench/src/components/study/
git commit -m "feat: add ChatInterface and SessionSidebar components"
```

---

## Task 11: Interactive Study page

**Files:**
- Create: `workbench/workbench/src/app/interactive-study/page.tsx`

**Step 1: Create the page**

Create `workbench/workbench/src/app/interactive-study/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { SessionSidebar } from "@/components/study/session-sidebar";
import { ChatInterface } from "@/components/study/chat-interface";

interface Session {
  id: number;
  title: string;
  status: string;
  prompt: string;
  created_at: string;
}

interface Message {
  id: number;
  type: "user" | "assistant";
  content: string;
  timestamp: string;
}

const POLL_INTERVAL = 2000; // 2 seconds

export default function InteractiveStudyPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionStatus, setActiveSessionStatus] = useState<string>("waiting_for_dev");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<number>(0);

  // Fetch sessions list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/interactive-study/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // Silently retry on next poll
    }
  }, []);

  // Fetch messages for active session
  const fetchMessages = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      const res = await fetch(
        `/api/interactive-study/sessions/${activeSessionId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setActiveSessionStatus(data.status);

        if (data.messages.length > 0) {
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
        }
      }
    } catch {
      // Silently retry on next poll
    }
  }, [activeSessionId]);

  // Initial load
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Poll for messages when session is active
  useEffect(() => {
    if (!activeSessionId) return;

    fetchMessages();

    pollRef.current = setInterval(() => {
      fetchMessages();
      fetchSessions(); // Also refresh session list for status dots
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeSessionId, fetchMessages, fetchSessions]);

  // Create new session
  const handleNewSession = useCallback(async () => {
    try {
      const res = await fetch("/api/interactive-study/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Study Session — ${new Date().toLocaleDateString()}`,
        }),
      });
      if (res.ok) {
        const session = await res.json();
        await fetchSessions();
        setActiveSessionId(session.id);
        setMessages([]);
        lastMessageIdRef.current = 0;
        setError(null);
      }
    } catch {
      setError("Failed to create session");
    }
  }, [fetchSessions]);

  // Select session
  const handleSelectSession = useCallback((id: number) => {
    setActiveSessionId(id);
    setMessages([]);
    lastMessageIdRef.current = 0;
    setError(null);
  }, []);

  // Delete session
  const handleDeleteSession = useCallback(async (id: number) => {
    try {
      await fetch(`/api/interactive-study/sessions/${id}`, {
        method: "DELETE",
      });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      await fetchSessions();
    } catch {
      setError("Failed to delete session");
    }
  }, [activeSessionId, fetchSessions]);

  // Send message
  const handleSendMessage = useCallback(async (content: string) => {
    if (!activeSessionId) return;
    setError(null);

    try {
      const res = await fetch(
        `/api/interactive-study/sessions/${activeSessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      if (res.ok) {
        // Immediately show user message
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(), // Temporary ID until next poll
            type: "user" as const,
            content,
            timestamp: new Date().toISOString(),
          },
        ]);
        setActiveSessionStatus("developing");
        // Fetch will pick up the real message + status on next poll
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send message");
      }
    } catch {
      setError("Failed to send message");
    }
  }, [activeSessionId]);

  return (
    <div className="flex h-[calc(100vh-0px)] portrait:h-[calc(100vh-60px)]">
      {/* Session sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              dismiss
            </button>
          </div>
        )}

        <ChatInterface
          sessionId={activeSessionId}
          sessionStatus={activeSessionStatus}
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify the page compiles**

Run: `cd workbench/workbench && npx next build --no-lint 2>&1 | head -20`
Or just: `cd workbench/workbench && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
cd workbench
git add workbench/src/app/interactive-study/
git commit -m "feat: add interactive study page with chat UI"
```

---

## Task 12: Add Interactive Study to navigation

**Files:**
- Modify: `workbench/workbench/src/components/nav.tsx` (add to sections array)

**Step 1: Add the nav entry**

In `workbench/workbench/src/components/nav.tsx`, add a new entry to the `sections` array after the "Study" entry (after line 62):

```typescript
  {
    href: "/interactive-study",
    label: "Tutor",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
```

**Step 2: Visually verify**

Run: `cd workbench/workbench && npm run dev`
Check: Navigate to http://localhost:3000 and confirm "Tutor" appears in the sidebar nav between "Study" and "Crawl".

**Step 3: Commit**

```bash
cd workbench
git add workbench/src/components/nav.tsx
git commit -m "feat: add Tutor (interactive study) to navigation"
```

---

## Task 13: Build verification and smoke test

**Files:** None (testing only)

**Step 1: Run all tests**

Run: `cd workbench/workbench && npx vitest run`
Expected: All tests pass

**Step 2: Run the build**

Run: `cd workbench/workbench && npm run build`
Expected: Build succeeds with no errors

**Step 3: Manual smoke test**

1. Start dev server: `cd workbench/workbench && npm run dev`
2. Navigate to http://localhost:3000/interactive-study
3. Verify: Session sidebar visible on left, empty state shown in center
4. Click "New Session" — a session should appear in the sidebar
5. Type a message and click Send — message should appear as a blue bubble on the right
6. If the daemon is running, an agent response should appear after a few seconds
7. Test LaTeX: type "What is $x^2 + y^2 = r^2$?" — the math should render

**Step 4: Verify daemon picks up interactive-study tasks**

If the daemon is running (`python3 workbench/scripts/agent-daemon.py`):
1. Create a session via the UI
2. Send a message
3. Check daemon logs — should show `[interactive-study] Found task N: Study Session...`
4. After response, task status should go back to `waiting_for_dev`

If the daemon is NOT running, start it:
Run: `cd workbench/workbench && python3 scripts/agent-daemon.py`

**Step 5: Final commit (if any fixes were needed)**

```bash
cd workbench
git add -A
git commit -m "fix: address smoke test findings"
```

---

## Summary of all files changed/created

### New Files
- `workbench/workbench/src/app/interactive-study/page.tsx` — Main page
- `workbench/workbench/src/app/api/interactive-study/sessions/route.ts` — List/create sessions
- `workbench/workbench/src/app/api/interactive-study/sessions/[id]/route.ts` — Session CRUD
- `workbench/workbench/src/app/api/interactive-study/sessions/[id]/messages/route.ts` — Messages
- `workbench/workbench/src/components/latex-renderer.tsx` — KaTeX rendering
- `workbench/workbench/src/components/latex-renderer.test.tsx` — LaTeX tests
- `workbench/workbench/src/components/study/message-bubble.tsx` — Chat bubble
- `workbench/workbench/src/components/study/chat-interface.tsx` — Chat area
- `workbench/workbench/src/components/study/session-sidebar.tsx` — Session list
- `workbench/workbench/src/lib/interactive-study-db.test.ts` — DB tests
- `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/CLAUDE.md` — Agent persona
- `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/config.json` — Agent config

### Modified Files
- `workbench/workbench/package.json` — Add KaTeX dependency
- `workbench/workbench/src/lib/agent-db.ts` — Add interactive-study to CHECK constraint + migration
- `workbench/workbench/src/lib/db.ts` — Call migration function
- `workbench/workbench/src/app/layout.tsx` — Import KaTeX CSS
- `workbench/workbench/src/components/nav.tsx` — Add Tutor nav entry
- `workbench/workbench/scripts/agent_executor.py` — Add execute_interactive_study
- `workbench/workbench/scripts/task_handlers.py` — Add InteractiveStudyHandler, exclude from worker
- `workbench/workbench/scripts/agent-daemon.py` — Register InteractiveStudyHandler
