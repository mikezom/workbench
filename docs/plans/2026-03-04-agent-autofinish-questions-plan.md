# Agent Auto-finish & Clarification Questions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agent tasks auto-merge and finish after successful build, and repurpose "Waiting for Review" for agent clarification questions with user-selectable answers.

**Architecture:** Exit+re-invoke pattern. Claude CLI writes `questions.json` to worktree root when it needs clarification, then exits. The executor detects the file, stores questions in a new DB table, and sets status to `waiting_for_review`. When the user answers via the UI, the daemon re-invokes Claude with answers appended. After successful build, the executor merges into main, cleans up, and marks finished.

**Tech Stack:** Next.js (App Router), SQLite (better-sqlite3), Python 3.9 (daemon/executor), Tailwind CSS

---

### Task 1: Add `agent_task_questions` Table and DB Functions

**Files:**
- Modify: `workbench/src/lib/agent-db.ts`

**Step 1: Add the questions table to `initAgentSchema()`**

Inside the `db.exec()` template literal in `initAgentSchema()`, append after the `agent_lock` INSERT statement:

```sql
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
```

**Step 2: Add the TypeScript interface**

After the existing `AgentLock` interface, add:

```typescript
export interface AgentTaskQuestion {
  id: number;
  task_id: number;
  question_id: string;
  question: string;
  options: string;  // JSON array string
  answer: string | null;
  created_at: string;
}
```

**Step 3: Add `saveQuestions()` function**

After the `getTaskOutput` function, add:

```typescript
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
```

**Step 4: Add `getQuestions()` function**

```typescript
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
```

**Step 5: Add `answerQuestions()` function**

```typescript
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
```

**Step 6: Add `getTasksReadyToResume()` function**

```typescript
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
```

Note: The `AND EXISTS` clause ensures we only resume tasks that actually have questions (not tasks manually set to `waiting_for_review`).

**Step 7: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no type errors.

**Step 8: Commit**

```bash
git add workbench/src/lib/agent-db.ts
git commit -m "feat(agent): add agent_task_questions table and CRUD functions"
```

---

### Task 2: Add Questions API Route

**Files:**
- Create: `workbench/src/app/api/agent/tasks/[id]/questions/route.ts`

**Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTask, getQuestions, answerQuestions } from "@/lib/agent-db";

export function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const questions = getQuestions(id);
  // Parse options JSON for the client
  const parsed = questions.map((q) => ({
    ...q,
    options: JSON.parse(q.options) as string[],
  }));

  return NextResponse.json(parsed);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "waiting_for_review") {
    return NextResponse.json(
      { error: "Task is not waiting for review" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const answers: Record<string, string> = body.answers;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { error: "answers object is required" },
      { status: 400 }
    );
  }

  answerQuestions(id, answers);

  return NextResponse.json({ ok: true });
}
```

**Step 2: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add workbench/src/app/api/agent/tasks/\\[id\\]/questions/route.ts
git commit -m "feat(agent): add GET/POST /api/agent/tasks/[id]/questions"
```

---

### Task 3: Add `merge_into_main()` and Questions Detection to Executor

**Files:**
- Modify: `workbench/scripts/agent_executor.py`

**Step 1: Add `merge_into_main()` function**

After the `run_build()` function (around line 635), add:

```python
def merge_into_main(
    repo_root: str,
    worktree_path: str,
    branch_name: str,
    conn: sqlite3.Connection,
    task_id: int,
) -> str | None:
    """Merge the task branch into main and clean up.

    Returns the merge commit SHA on success, or None if merge fails.
    Cleans up the worktree and branch after merging.
    """
    append_output(conn, task_id, "system", f"Merging {branch_name} into main...")

    # Checkout main in the repo root
    result = _run_git(["checkout", "main"], cwd=repo_root)
    if result.returncode != 0:
        log.error("Failed to checkout main: %s", result.stderr.strip())
        append_output(conn, task_id, "system",
            f"Failed to checkout main: {result.stderr.strip()}")
        return None

    # Merge the task branch
    result = _run_git(["merge", branch_name], cwd=repo_root)
    if result.returncode != 0:
        log.error("Failed to merge %s into main: %s", branch_name, result.stderr.strip())
        append_output(conn, task_id, "system",
            f"Merge failed: {result.stderr.strip()}")
        # Go back to main (should already be there)
        _run_git(["merge", "--abort"], cwd=repo_root)
        return None

    # Get the merge commit SHA
    result = _run_git(["rev-parse", "HEAD"], cwd=repo_root)
    commit_sha = result.stdout.strip() if result.returncode == 0 else None

    append_output(conn, task_id, "system",
        f"Merged into main (commit: {commit_sha[:7] if commit_sha else 'unknown'})")

    # Clean up worktree and branch
    cleanup_worktree(repo_root, worktree_path, branch_name)
    append_output(conn, task_id, "system", "Cleaned up worktree and branch.")

    return commit_sha
```

**Step 2: Add `check_questions()` function**

After `merge_into_main()`, add:

```python
QUESTIONS_FILE = "questions.json"


def check_questions(worktree_path: str) -> list[dict] | None:
    """Check for a questions.json file in the worktree root.

    Returns parsed questions list if found and valid, None otherwise.
    Validates that each question has id, question, and options (2-4 items).
    """
    qpath = os.path.join(worktree_path, QUESTIONS_FILE)
    if not os.path.isfile(qpath):
        return None

    try:
        with open(qpath) as f:
            questions = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log.warning("Failed to parse %s: %s", qpath, e)
        return None

    if not isinstance(questions, list) or len(questions) == 0:
        log.warning("questions.json is empty or not a list")
        return None

    # Validate structure
    validated = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            log.warning("Question %d is not a dict — skipping", i)
            continue
        qid = q.get("id", f"q{i+1}")
        question = q.get("question", "")
        options = q.get("options", [])
        if not question or not isinstance(options, list) or len(options) < 2:
            log.warning("Question %d has invalid structure — skipping", i)
            continue
        validated.append({"id": str(qid), "question": question, "options": options})

    return validated if validated else None


def save_questions_to_db(
    conn: sqlite3.Connection, task_id: int, questions: list[dict]
) -> None:
    """Store parsed questions in the agent_task_questions table."""
    for q in questions:
        conn.execute(
            "INSERT INTO agent_task_questions (task_id, question_id, question, options) "
            "VALUES (?, ?, ?, ?)",
            (task_id, q["id"], q["question"], json.dumps(q["options"])),
        )
    conn.commit()
    log.info("Saved %d questions for task %d", len(questions), task_id)
```

**Step 3: Modify `execute_task()` to detect questions and auto-merge**

Replace the current `execute_task()` function body. The key changes are:
1. After `invoke_claude()`, check for `questions.json`
2. If questions found: store them, return with special signal
3. If no questions: rebase → build → merge → record commit

```python
class QuestionsAsked(Exception):
    """Raised when the agent wrote questions.json and needs user input."""


def execute_task(conn: sqlite3.Connection, task: dict) -> None:
    """Execute a full task lifecycle: worktree → Claude → rebase → build → merge.

    On success: merges into main, cleans up, returns normally.
    On questions: stores questions, raises QuestionsAsked (worktree preserved).
    On cancel: cleans up worktree, raises CancelledError.
    On failure: preserves worktree for debugging, raises the original exception.
    """
    task_id = task["id"]
    prompt = task["prompt"]

    worktree_path = None
    branch_name = None

    try:
        # Step 1: Create worktree
        append_output(conn, task_id, "system", "Creating git worktree...")
        worktree_path, branch_name = create_worktree(REPO_ROOT, task_id, task["title"])

        # Update task record with worktree info
        conn.execute(
            "UPDATE agent_tasks SET branch_name = ?, worktree_path = ? WHERE id = ?",
            (branch_name, worktree_path, task_id),
        )
        conn.commit()
        append_output(conn, task_id, "system",
            f"Worktree: {worktree_path}  Branch: {branch_name}")

        # Step 1b: Inject working agent CLAUDE.md
        inject_claude_md(worktree_path)

        # Step 2: Invoke Claude Code
        invoke_claude(worktree_path, prompt, conn, task_id)

        # Step 2b: Check for clarification questions
        questions = check_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Agent asked {len(questions)} clarification question(s) — awaiting user answers")
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Task {task_id} has {len(questions)} questions")

        # Step 3: Rebase onto main
        rebase_onto_main(REPO_ROOT, worktree_path, branch_name, conn, task_id)

        # Step 4: Run build validation
        run_build(worktree_path, conn, task_id)

        # Step 5: Merge into main and clean up
        commit_sha = merge_into_main(
            REPO_ROOT, worktree_path, branch_name, conn, task_id
        )
        if commit_sha:
            conn.execute(
                "UPDATE agent_tasks SET commit_id = ? WHERE id = ?",
                (commit_sha, task_id),
            )
            conn.commit()

        append_output(conn, task_id, "system",
            "Execution complete — task merged and finished")
        log.info("Task %d execution complete, merged into main", task_id)

    except (CancelledError, QuestionsAsked):
        if isinstance(sys.exc_info()[1], CancelledError):
            append_output(conn, task_id, "system", "Task cancelled — cleaning up")
            if worktree_path and branch_name:
                cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        # QuestionsAsked: preserve worktree, don't clean up
        raise

    except Exception:
        # Preserve worktree on failure for debugging
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Task failed — worktree preserved at {worktree_path} for debugging")
        raise
```

Note: Add `import sys` at the top of the file if not already present.

**Step 4: Add `resume_task()` function**

After `execute_task()`, add:

```python
def resume_task(conn: sqlite3.Connection, task: dict) -> None:
    """Resume a task after the user answered clarification questions.

    Reads answered questions from DB, formats them as context, re-invokes
    Claude CLI, then continues the pipeline (rebase → build → merge).
    Can raise QuestionsAsked again if Claude asks more questions.
    """
    task_id = task["id"]
    worktree_path = task["worktree_path"]
    branch_name = task["branch_name"]

    if not worktree_path or not branch_name:
        raise RuntimeError(
            f"Task {task_id} has no worktree_path or branch_name — cannot resume"
        )

    if not os.path.isdir(worktree_path):
        raise RuntimeError(
            f"Worktree {worktree_path} does not exist — cannot resume"
        )

    try:
        # Step 1: Read answered questions
        rows = conn.execute(
            "SELECT question_id, question, answer FROM agent_task_questions "
            "WHERE task_id = ? ORDER BY id ASC",
            (task_id,),
        ).fetchall()

        qa_lines = []
        for row in rows:
            qa_lines.append(f"Q: {row['question']}\nA: {row['answer']}")
        qa_context = "\n\n".join(qa_lines)

        # Step 2: Delete questions.json from worktree
        qpath = os.path.join(worktree_path, QUESTIONS_FILE)
        if os.path.isfile(qpath):
            os.remove(qpath)

        # Step 3: Build resumed prompt
        original_prompt = task["prompt"]
        resumed_prompt = (
            f"{original_prompt}\n\n"
            f"---\n\n"
            f"## Previous Clarification Q&A\n\n"
            f"You previously asked clarification questions. Here are the user's answers:\n\n"
            f"{qa_context}\n\n"
            f"Continue with the task using these answers. Do not ask the same questions again."
        )

        append_output(conn, task_id, "system",
            f"Resuming task with {len(rows)} answered question(s)...")

        # Step 4: Re-inject CLAUDE.md (in case worktree was modified)
        inject_claude_md(worktree_path)

        # Step 5: Re-invoke Claude Code
        invoke_claude(worktree_path, resumed_prompt, conn, task_id)

        # Step 6: Check for new questions
        questions = check_questions(worktree_path)
        if questions:
            append_output(conn, task_id, "system",
                f"Agent asked {len(questions)} more question(s) — awaiting user answers")
            # Clear old questions and save new ones
            conn.execute(
                "DELETE FROM agent_task_questions WHERE task_id = ?",
                (task_id,),
            )
            save_questions_to_db(conn, task_id, questions)
            raise QuestionsAsked(f"Task {task_id} has {len(questions)} new questions")

        # Step 7: Rebase onto main
        rebase_onto_main(REPO_ROOT, worktree_path, branch_name, conn, task_id)

        # Step 8: Run build validation
        run_build(worktree_path, conn, task_id)

        # Step 9: Merge into main and clean up
        commit_sha = merge_into_main(
            REPO_ROOT, worktree_path, branch_name, conn, task_id
        )
        if commit_sha:
            conn.execute(
                "UPDATE agent_tasks SET commit_id = ? WHERE id = ?",
                (commit_sha, task_id),
            )
            conn.commit()

        append_output(conn, task_id, "system",
            "Resumed task complete — merged and finished")
        log.info("Resumed task %d complete, merged into main", task_id)

    except (CancelledError, QuestionsAsked):
        if isinstance(sys.exc_info()[1], CancelledError):
            append_output(conn, task_id, "system", "Task cancelled — cleaning up")
            if worktree_path and branch_name:
                cleanup_worktree(REPO_ROOT, worktree_path, branch_name)
        raise

    except Exception:
        if worktree_path:
            append_output(conn, task_id, "system",
                f"Resumed task failed — worktree preserved at {worktree_path}")
        raise
```

**Step 5: Verify Python syntax**

Run: `python3 -c "import py_compile; py_compile.compile('workbench/scripts/agent_executor.py', doraise=True)"`
Expected: No errors.

**Step 6: Commit**

```bash
git add workbench/scripts/agent_executor.py
git commit -m "feat(agent): add auto-merge, questions detection, and resume_task to executor"
```

---

### Task 4: Update Daemon to Handle Auto-finish and Resume

**Files:**
- Modify: `workbench/scripts/agent-daemon.py`

**Step 1: Import `QuestionsAsked` and `resume_task`**

Change the import at line 24-25 from:

```python
from agent_executor import execute_task as run_task_pipeline
from agent_executor import CancelledError
```

to:

```python
from agent_executor import execute_task as run_task_pipeline
from agent_executor import resume_task as run_resume_pipeline
from agent_executor import CancelledError, QuestionsAsked
```

**Step 2: Add `get_task_ready_to_resume()` function**

After `get_next_pending_task()`, add:

```python
def get_task_ready_to_resume(conn: sqlite3.Connection) -> dict | None:
    """Return the oldest task with status 'waiting_for_review' where all questions are answered."""
    row = conn.execute(
        """SELECT t.* FROM agent_tasks t
           WHERE t.status = 'waiting_for_review'
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
    if row is None:
        return None
    return dict(row)
```

**Step 3: Modify the main loop to handle QuestionsAsked and resume**

Replace the task execution block in `main()` (lines 258-282 approximately). The new block handles three outcomes: success → finished, questions → waiting_for_review, failure/cancel as before. And adds a second check for resumable tasks.

Replace the `try: run_task_pipeline(conn, task) ... except` block (the inner try inside `if task:`) with:

```python
                    try:
                        run_task_pipeline(conn, task)
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn, task_id, "finished", completed_at=now
                        )
                        log.info("Task %d status -> finished", task_id)
                    except QuestionsAsked:
                        update_task_status(conn, task_id, "waiting_for_review")
                        log.info("Task %d status -> waiting_for_review (questions)", task_id)
                    except CancelledError:
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn, task_id, "cancelled", completed_at=now
                        )
                        log.info("Task %d status -> cancelled", task_id)
                    except Exception:
                        tb = traceback.format_exc()
                        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                        update_task_status(
                            conn,
                            task_id,
                            "failed",
                            completed_at=now,
                            error_message=tb,
                        )
                        log.error("Task %d failed:\n%s", task_id, tb)
                        append_output(conn, task_id, "system", f"Task failed: {tb}")
                    finally:
                        release_lock(conn)
                        log.info("Lock released")
```

Then, **after** the existing `if task:` block but still inside the `if not is_locked():` block, add a second check for resumable tasks:

```python
                else:
                    # No new tasks — check for resumable tasks
                    resume = get_task_ready_to_resume(conn)
                    if resume:
                        resume_id = resume["id"]
                        log.info("Found resumable task %d: %s", resume_id, resume["title"])

                        if not acquire_lock(conn, resume_id):
                            log.warning("Failed to acquire lock for resume task %d", resume_id)
                            time.sleep(POLL_INTERVAL)
                            continue

                        update_task_status(conn, resume_id, "developing")
                        log.info("Task %d status -> developing (resume)", resume_id)

                        try:
                            run_resume_pipeline(conn, resume)
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "finished", completed_at=now
                            )
                            log.info("Resumed task %d status -> finished", resume_id)
                        except QuestionsAsked:
                            update_task_status(conn, resume_id, "waiting_for_review")
                            log.info("Resumed task %d -> waiting_for_review (more questions)", resume_id)
                        except CancelledError:
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "cancelled", completed_at=now
                            )
                            log.info("Resumed task %d -> cancelled", resume_id)
                        except Exception:
                            tb = traceback.format_exc()
                            now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                            update_task_status(
                                conn, resume_id, "failed",
                                completed_at=now, error_message=tb,
                            )
                            log.error("Resumed task %d failed:\n%s", resume_id, tb)
                            append_output(conn, resume_id, "system", f"Resume failed: {tb}")
                        finally:
                            release_lock(conn)
                            log.info("Lock released (resume)")
```

**Step 4: Verify Python syntax**

Run: `python3 -c "import py_compile; py_compile.compile('workbench/scripts/agent-daemon.py', doraise=True)"`
Expected: No errors.

**Step 5: Commit**

```bash
git add workbench/scripts/agent-daemon.py
git commit -m "feat(agent): daemon handles auto-finish, questions, and task resumption"
```

---

### Task 5: Add Questions UI to TaskDetailModal

**Files:**
- Modify: `workbench/src/app/agent/page.tsx`

**Step 1: Add `AgentTaskQuestion` type**

After the existing `DecomposedTask` interface (around line 52), add:

```typescript
interface AgentTaskQuestion {
  id: number;
  task_id: number;
  question_id: string;
  question: string;
  options: string[];
  answer: string | null;
  created_at: string;
}
```

**Step 2: Add questions state and fetching to `TaskDetailModal`**

Inside `TaskDetailModal`, add state variables after `outputEndRef`:

```typescript
  const [questions, setQuestions] = useState<AgentTaskQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState(false);
```

Add a fetch function after `fetchTask`:

```typescript
  const fetchQuestions = useCallback(async () => {
    if (currentTask.status !== "waiting_for_review") return;
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/questions`);
      if (!res.ok) return;
      const data: AgentTaskQuestion[] = await res.json();
      setQuestions(data);
      // Pre-fill already answered questions
      const existing: Record<string, string> = {};
      for (const q of data) {
        if (q.answer) existing[q.question_id] = q.answer;
      }
      if (Object.keys(existing).length > 0) {
        setSelectedAnswers((prev) => ({ ...existing, ...prev }));
      }
    } catch {
      // ignore
    }
  }, [task.id, currentTask.status]);
```

Add `fetchQuestions()` to the `useEffect` that does initial load (after `fetchTask();`):

```typescript
    fetchQuestions();
```

Also add it to the polling interval condition — change the `if (task.status === "developing")` block to also poll for `waiting_for_review`:

```typescript
    if (task.status === "developing" || task.status === "waiting_for_review") {
      pollRef.current = setInterval(() => {
        fetchOutput();
        fetchTask();
        fetchQuestions();
      }, 3000);
    }
```

**Step 3: Add answer submission handler**

After `handleDelete`, add:

```typescript
  const handleSubmitAnswers = async () => {
    const unanswered = questions.filter((q) => !q.answer && !selectedAnswers[q.question_id]);
    if (unanswered.length > 0) return; // All questions must be answered

    setSubmittingAnswers(true);
    try {
      const res = await fetch(`/api/agent/tasks/${task.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: selectedAnswers }),
      });
      if (res.ok) {
        // Refresh questions to show answers
        fetchQuestions();
        onTaskUpdated();
      }
    } catch {
      // ignore
    } finally {
      setSubmittingAnswers(false);
    }
  };
```

**Step 4: Add questions panel to the modal body**

Insert this between the error message section and the output section (after the `{currentTask.error_message && ...}` block):

```tsx
        {/* Clarification Questions */}
        {currentTask.status === "waiting_for_review" && questions.length > 0 && (
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-purple-50 dark:bg-purple-900/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-3">
              Clarification Questions
            </p>
            <div className="space-y-4">
              {questions.filter((q) => !q.answer).map((q) => (
                <div key={q.question_id}>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                    {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((option) => (
                      <label
                        key={option}
                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${
                          selectedAnswers[q.question_id] === option
                            ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                            : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.question_id}
                          value={option}
                          checked={selectedAnswers[q.question_id] === option}
                          onChange={() =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [q.question_id]: option,
                            }))
                          }
                          className="accent-purple-600"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {questions.some((q) => q.answer) && (
                <div className="border-t border-purple-200 dark:border-purple-800 pt-3">
                  <p className="text-xs text-purple-500 dark:text-purple-400 mb-2">Previously answered:</p>
                  {questions.filter((q) => q.answer).map((q) => (
                    <div key={q.question_id} className="text-xs text-neutral-500 mb-1">
                      <span className="font-medium">{q.question}</span> — {q.answer}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {questions.some((q) => !q.answer) && (
              <button
                onClick={handleSubmitAnswers}
                disabled={
                  submittingAnswers ||
                  questions.filter((q) => !q.answer).some((q) => !selectedAnswers[q.question_id])
                }
                className="mt-3 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
              >
                {submittingAnswers ? "Submitting..." : "Submit Answers"}
              </button>
            )}
          </div>
        )}
```

**Step 5: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add workbench/src/app/agent/page.tsx
git commit -m "feat(agent): add clarification questions UI in task detail modal"
```

---

### Task 6: Update Working Agent CLAUDE.md

**Files:**
- Modify: `workbench/data/agent-working-claude.md`

**Step 1: Add the questions convention section**

Append before the "What NOT to Do" section:

```markdown
## Asking Clarification Questions

If you encounter unclear requirements or multiple valid approaches, you can ask the user for clarification instead of guessing.

**How to ask:**

1. Write a `questions.json` file to the repository root (the directory you're working in)
2. Then stop — do not continue working until you receive answers

**File format:**

```json
[
  {
    "id": "q1",
    "question": "Which authentication method should I use?",
    "options": ["JWT tokens", "Session cookies", "OAuth2"]
  },
  {
    "id": "q2",
    "question": "Should the API return paginated results?",
    "options": ["Yes, with cursor pagination", "Yes, with offset pagination", "No, return all results"]
  }
]
```

**Rules:**
- Each question must have a unique `id` (e.g., "q1", "q2")
- Each question must have 2-4 `options`
- Write all your questions at once — you will get all answers together
- After writing `questions.json`, stop immediately. Do not write any code or make any changes.
- If you receive previous Q&A context in your prompt, use those answers and do not re-ask the same questions
```

**Step 2: Commit**

```bash
git add workbench/data/agent-working-claude.md
git commit -m "feat(agent): add questions.json convention to working agent CLAUDE.md"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `workbench/docs/agent-section.md`

**Step 1: Update the Architecture diagram**

In the architecture diagram, change step 6 from:
```
│  6. Set status='waiting_for_review', release lock
```
to:
```
│  6. If questions.json found: store questions, set status='waiting_for_review'
│  7. If no questions: merge into main, set status='finished'
```

**Step 2: Update the Task Statuses table**

Change the `waiting_for_review` description from:
```
| `waiting_for_review` | Agent finished; awaiting user review |
```
to:
```
| `waiting_for_review` | Agent needs clarification; awaiting user answers |
```

Change the `finished` description from:
```
| `finished` | User approved the result |
```
to:
```
| `finished` | Build passed; changes merged into main |
```

**Step 3: Add Questions Convention section**

After the "Worktree Management" section, add a new section documenting the questions convention, file format, and resume flow.

**Step 4: Update the Execution Pipeline lifecycle**

Update step 7 in the lifecycle to reflect the new flow:
```
7. Check for questions.json
   If found: store questions in DB, set status='waiting_for_review', preserve worktree
   If not found: continue to step 8
8. Merge task branch into main
9. Clean up worktree and branch
10. Set status='finished'
```

Add the resume lifecycle:
```
Resume (after user answers questions):
1. Read answers from DB
2. Re-invoke Claude with original prompt + Q&A context
3. Check for new questions.json (loop back if found)
4. Rebase onto main
5. npm run build (with fix attempts)
6. Merge into main, clean up, set status='finished'
```

**Step 5: Update the Key Files table**

Add the new route file:
```
| `src/app/api/agent/tasks/[id]/questions/route.ts` | `GET` questions, `POST` answers |
```

**Step 6: Commit**

```bash
git add workbench/docs/agent-section.md
git commit -m "docs(agent): update agent-section.md with auto-finish and questions flow"
```

---

### Task 8: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

**Step 1: Add new phase items**

Under "Phase 5: Agent Section", add a new sub-section:

```markdown
#### 5g: Auto-finish & Clarification Questions
- [x] Add `agent_task_questions` table and CRUD functions
- [x] Add GET/POST /api/agent/tasks/[id]/questions API route
- [x] Add merge_into_main(), questions detection, and resume_task to executor
- [x] Update daemon to handle auto-finish, questions, and resumption
- [x] Add clarification questions UI in task detail modal
- [x] Update working agent CLAUDE.md with questions.json convention
- [x] Update agent-section.md documentation
```

**Step 2: Update the status table**

Change the Phase 5 row to reflect the new sub-phase.

**Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md with phase 5g completion"
```

---

### Task 9: Build Validation and Manual Test

**Step 1: Run full build**

Run: `cd workbench && npm run build`
Expected: Build succeeds with zero errors.

**Step 2: Verify daemon starts**

Run: `cd /Users/ccnas/DEVELOPMENT/workbench && python3 -c "import sys; sys.path.insert(0, 'workbench/scripts'); import py_compile; py_compile.compile('workbench/scripts/agent_executor.py', doraise=True); py_compile.compile('workbench/scripts/agent-daemon.py', doraise=True); print('OK')"`
Expected: `OK`

**Step 3: Verify DB schema migration is additive**

The new table uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run on an existing database — no migration needed.
