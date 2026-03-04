# Agent Auto-finish & Clarification Questions

**Date**: 2026-03-04

## Problem

Two issues with the current agent task lifecycle:

1. Tasks that pass build validation still land in "Waiting for Review" and require manual promotion to "Finished". Since the build passing is sufficient validation, this is unnecessary friction.

2. The "Waiting for Review" status has no mechanism for agent-user interaction. When an agent needs clarification during execution, there's no way to pause, ask questions, and resume.

## Design

### Change 1: Successful Build → Auto-merge + Finish

After the full pipeline (worktree → claude → rebase → build) succeeds:

1. Merge the task branch into main from the repo root
2. Record the merge commit SHA on the task record
3. Clean up the worktree and delete the branch
4. Set status to `finished`

The executor handles this in a new `merge_into_main()` function called at the end of `execute_task()`.

### Change 2: Agent Clarification Questions

#### File-based Convention

The working agent CLAUDE.md instructs Claude that when it needs user clarification, it should:

1. Write a `questions.json` file to the repository root (worktree root)
2. Format: `[{ "id": "q1", "question": "...", "options": ["A", "B", "C"] }]`
3. Each question must have 2-4 options
4. Stop working after writing the file

#### Executor Flow

After Claude CLI exits, the executor checks for `questions.json` in the worktree:

- **If found**: Parse questions, store in DB, set status to `waiting_for_review`, release lock, preserve worktree. Return early (no rebase/build).
- **If not found**: Continue with rebase → build → merge → finished.

#### Resume Flow

A new `resume_task()` function handles resumption:

1. Read answered questions from DB
2. Format as context: "Previous Q&A: Q: ... A: ..."
3. Delete `questions.json` from worktree
4. Re-invoke Claude CLI with original prompt + Q&A context appended
5. After Claude exits, check for new `questions.json` (cycle can repeat)
6. If no questions: rebase → build → merge → finished

#### Daemon Changes

The poll loop gains a second pickup condition:

1. (Existing) `status='waiting_for_dev'` — new tasks
2. (New) `status='waiting_for_review'` AND all questions answered — resume tasks

Resumed tasks call `resume_task()` instead of `execute_task()`.

#### Database: `agent_task_questions` Table

```sql
CREATE TABLE IF NOT EXISTS agent_task_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,           -- JSON array of option strings
  answer TEXT,                     -- NULL until user answers
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_questions_task
  ON agent_task_questions(task_id);
```

DB functions:

- `saveQuestions(taskId, questions[])` — bulk insert from parsed questions.json
- `getQuestions(taskId)` — return all questions for a task
- `answerQuestions(taskId, answers)` — update answers by question_id
- `getTasksReadyToResume()` — tasks in `waiting_for_review` with all questions answered

#### API Routes

- `GET /api/agent/tasks/[id]/questions` — return questions for a task
- `POST /api/agent/tasks/[id]/questions` — submit answers `{ answers: { q1: "option text", ... } }`

#### UI Changes

TaskDetailModal gains a questions panel when task status is `waiting_for_review`:

- Fetches questions from the API
- Displays each question with radio buttons for options
- Submit button sends answers
- After submission, task auto-resumes on next daemon poll cycle

#### Working Agent CLAUDE.md Update

Append instructions about the questions.json convention:

- When to ask questions (unclear requirements, multiple valid approaches)
- File format and location
- Constraint: 2-4 options per question
- Must stop working after writing the file

## Files Modified

| File | Change |
|------|--------|
| `src/lib/agent-db.ts` | Add questions table schema, CRUD functions |
| `scripts/agent_executor.py` | Add merge_into_main(), resume_task(), questions.json detection |
| `scripts/agent-daemon.py` | Add resume pickup condition, call resume_task() |
| `src/app/api/agent/tasks/[id]/questions/route.ts` | New: GET/POST for questions |
| `src/app/agent/page.tsx` | Add questions UI in TaskDetailModal |
| `data/agent-working-claude.md` | Add questions.json convention instructions |
| `docs/agent-section.md` | Update with new flow documentation |
