# Agentic Tasks Section — Technical Description

## Overview

The Agentic Tasks section is an autonomous task execution system built around Claude Code CLI. A user submits a natural-language objective via the web UI; an LLM decomposes it into atomic sub-tasks; a Python polling daemon picks them up one-at-a-time and runs Claude Code in isolated git worktrees. On completion, changes are rebased onto `main` and validated with `npm run build`.

The system comprises three modules:

- **Module A** — Web UI + API routes + task decomposition (Next.js)
- **Module B** — Polling daemon (Python, managed by launchd)
- **Module C** — Execution pipeline (Python, invoked by the daemon)

## Architecture

```
User (browser)
  │
  ▼
Module A: Next.js UI + API Routes
  │  POST /api/agentic-tasksic-tasks/decompose → LLM breaks objective into sub-tasks
  │  POST /api/agentic-tasksic-tasks/tasks     → create task(s)
  │  GET  /api/agentic-tasksic-tasks/tasks     → list tasks (polled by UI every 5s)
  │  GET  /api/agentic-tasksic-tasks/tasks/[id]/output → poll task output
  │  PUT  /api/agentic-tasksic-tasks/tasks/[id] → cancel task
  │
  ▼
SQLite (data/workbench.db) — agent_tasks, agent_task_output, agent_lock
  │
  ▲ poll every 5s
  │
Module B: Python Polling Daemon (launchd)
  │  Checks for status='waiting_for_dev'
  │  Acquires global lock
  │  Passes task to Module C
  │
  ▼
Module C: Execution Pipeline (Python)
  │  1. git worktree add .worktrees/task-<id>
  │  2. Copy agent-working-claude.md → worktree CLAUDE.md
  │  3. claude -p [prompt] --output-format stream-json
  │  4. Rebase onto main (up to 3 conflict resolution attempts)
  │  5. npm run build (up to 3 fix attempts)
  │  6. If questions.json found: store questions, set status='waiting_for_review'
  │  7. If no questions: merge into main, set status='finished'
```

Scope: Module C operates **only** on the workbench repo (`/Users/ccnas/DEVELOPMENT/workbench/`).

## Key Files

| File | Purpose |
|------|---------|
| `src/app/agentic-tasks/page.tsx` | Entire Agentic Tasks UI — prompt input, task board, detail modal, config panel |
| `src/lib/agent-db.ts` | Agent SQLite schema, task CRUD, lock management, output storage |
| `src/lib/agent-config.ts` | Read/write `data/agent-config.json` (LLM provider/model/key) |
| `src/app/api/agentic-tasks/tasks/route.ts` | `GET` list all tasks, `POST` create task |
| `src/app/api/agentic-tasks/tasks/[id]/route.ts` | `GET` task detail, `PUT` update/cancel, `DELETE` task |
| `src/app/api/agentic-tasks/tasks/[id]/output/route.ts` | `GET` task execution output (paginated) |
| `src/app/api/agentic-tasks/decompose/route.ts` | `POST` LLM task decomposition |
| `src/app/api/agentic-tasks/tasks/[id]/questions/route.ts` | `GET` questions, `POST` answers |
| `src/app/api/agentic-tasks/config/route.ts` | `GET` read config (API key masked), `PUT` update config |
| `scripts/agent-daemon.py` | Polling daemon (Module B) — launchd-managed |
| `scripts/agent_executor.py` | Execution pipeline (Module C) — imported by daemon |
| `data/agent-config.json` | LLM config (gitignored, contains API key) |
| `data/agent-working-claude.md` | CLAUDE.md injected into worktrees for working agents |
| `data/agent-decompose-claude.md` | System prompt for the decomposition LLM |

## Database Schema

Added to `data/workbench.db` (extends existing schema in `src/lib/db.ts`). Schema initialization is in `src/lib/agent-db.ts`.

### `agent_tasks`

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
title TEXT NOT NULL,
prompt TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'waiting_for_dev'
  CHECK (status IN (
    'waiting_for_dev', 'developing', 'waiting_for_review',
    'finished', 'failed', 'cancelled'
  )),
parent_objective TEXT,       -- original user prompt (if decomposed)
branch_name TEXT,            -- e.g., 'task/add-login-button'
worktree_path TEXT,          -- e.g., '.worktrees/task-7'
error_message TEXT,          -- populated on failure
commit_id TEXT,              -- final merge commit SHA
created_at TEXT NOT NULL DEFAULT (datetime('now')),
started_at TEXT,
completed_at TEXT
```

### `agent_task_output`

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
timestamp TEXT NOT NULL DEFAULT (datetime('now')),
type TEXT NOT NULL,           -- 'stdout', 'stderr', 'system', 'assistant', 'tool'
content TEXT NOT NULL
```

### `agent_lock`

```sql
id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
locked INTEGER NOT NULL DEFAULT 0,
task_id INTEGER REFERENCES agent_tasks(id),
locked_at TEXT
```

The lock table enforces single-task execution. Only one task can run at a time.

### `agent_task_questions`

```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
question_id TEXT NOT NULL,
question TEXT NOT NULL,
options TEXT NOT NULL,            -- JSON array of option strings
answer TEXT,                     -- NULL until user answers
created_at TEXT NOT NULL DEFAULT (datetime('now'))
```

## Task Statuses

| Status | Meaning |
|--------|---------|
| `waiting_for_dev` | Queued, not yet picked up by the daemon |
| `developing` | Currently being executed by an agent in a worktree |
| `waiting_for_review` | Agent needs clarification; awaiting user answers |
| `finished` | Build passed; changes merged into main |
| `failed` | Execution failed after exhausting resolution attempts |
| `cancelled` | User cancelled the task |

Tasks are **atomic** — no dependencies between tasks. Each sub-task from decomposition is independent.

## Task Decomposition

When the user submits a prompt via the UI, they have two options:

1. **Decompose** — calls `POST /api/agentic-tasks/decompose` which sends the prompt to the configured LLM with the system prompt from `data/agent-decompose-claude.md`. The LLM returns a JSON array of `{title, prompt}` objects. The UI presents these for review/editing before queuing.

2. **Direct** — creates a single task directly from the prompt text.

The decompose route supports both Anthropic and OpenAI-compatible APIs. It extracts the JSON array from the LLM response (handling potential markdown code block wrapping).

## Execution Pipeline (Module C)

### Lifecycle of a Single Task

```
1. Create worktree
   git worktree add .worktrees/task-<id> -b task/<slug> main

2. Inject CLAUDE.md
   Copy data/agent-working-claude.md → worktree root as CLAUDE.md

3. Invoke Claude Code CLI
   claude -p "<prompt>" --dangerously-skip-permissions \
     --output-format stream-json --verbose

4. Stream output → DB
   Parse stream-json events, categorize as assistant/tool/system,
   store in agent_task_output table

5. Check for questions.json
   If found: store questions in DB, set status='waiting_for_review', preserve worktree
   If not found: continue to step 6

6. Rebase onto main
   git fetch origin && git rebase main
   Up to 3 conflict resolution attempts (invokes claude to resolve)

7. Build validation
   npm run build
   Up to 3 fix attempts (invokes claude to fix build errors)

8. Merge into main, clean up worktree and branch

9. Set status='finished'
```

#### Resume Lifecycle (after user answers questions)

```
1. Read answers from DB, format as Q&A context
2. Delete questions.json from worktree
3. Re-invoke Claude with original prompt + Q&A context
4. Check for new questions.json (loop back to step 1 of main lifecycle if found)
5. Rebase onto main
6. npm run build (with fix attempts)
7. Merge into main, clean up worktree and branch
8. Set status='finished'
```

### Cancellation

- The UI sets `status='cancelled'` via `PUT /api/agentic-tasks/tasks/[id]`
- The daemon checks the DB every 5 seconds during execution
- On detection: kills the Claude subprocess, cleans up the worktree

### Worktree Management

- Created under `/Users/ccnas/DEVELOPMENT/workbench/.worktrees/task-<id>/`
- Branch naming: `task/<slug>` (derived from task title)
- On success: worktree preserved for review
- On cancellation: worktree cleaned up
- On failure: worktree preserved for debugging
- `.worktrees/` directory is gitignored

### Agent Clarification Questions

When Claude needs user clarification during execution, it writes a `questions.json` file to the worktree root:

```json
[
  {
    "id": "q1",
    "question": "Which approach should I use?",
    "options": ["Option A", "Option B", "Option C"]
  }
]
```

The executor detects this file after Claude exits:
- **If found**: Questions are stored in `agent_task_questions` table, task status set to `waiting_for_review`, worktree preserved
- **If not found**: Pipeline continues to rebase, build, merge

**Resume flow** (after user answers via UI):
1. Daemon detects task with all questions answered
2. Re-invokes Claude with original prompt + Q&A context
3. If Claude writes new `questions.json`, cycle repeats
4. If no questions: rebase → build → merge into main → `finished`

Questions are stored in the `agent_task_questions` table (see Database Schema).

### Executable Discovery

The executor locates `claude` and `npm` binaries by checking:
1. Direct `which` lookup
2. `~/.nvm/` paths (for NVM-installed Node.js)

## Polling Daemon (Module B)

### Script: `scripts/agent-daemon.py`

```python
# Pseudocode
while True:
    if not is_locked():
        task = get_next_pending_task()  # oldest waiting_for_dev
        if task:
            acquire_lock(task.id)
            set_task_status(task.id, 'developing')
            try:
                execute_task(task)  # Module C
                set_task_status(task.id, 'waiting_for_review')
            except CancelledError:
                set_task_status(task.id, 'cancelled')
            except Exception:
                set_task_status(task.id, 'failed')
            finally:
                release_lock()
    sleep(5)
```

### Stale Lock Recovery

On daemon startup, if a lock is older than 30 minutes, it is cleared and the associated task is marked as `failed`. This handles daemon crashes.

### Signal Handling

SIGTERM and SIGINT trigger graceful shutdown — the daemon finishes its current poll cycle and exits.

### launchd Configuration

Plist at `~/Library/LaunchAgents/com.workbench.agent-daemon.plist`:
- `RunAtLoad: true`, `KeepAlive: true` — auto-restarts on crash
- `WorkingDirectory`: git repo root
- Logs: `logs/agent-daemon.out.log`, `logs/agent-daemon.err.log`

Load/unload:
```bash
launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
launchctl unload ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
```

## CLAUDE.md Files

Two separate instruction files for the two agent roles:

1. **Working Agent** (`data/agent-working-claude.md`) — copied into each worktree as `CLAUDE.md`. Contains:
   - Project structure and tech stack
   - Coding conventions (route exports, DB transactions, Tailwind-only styling)
   - Known pitfalls from REFLECTION.md
   - Git workflow (commit on current branch, no new branches)
   - Build validation requirement (`npm run build` must pass)

2. **Decomposition Agent** (`data/agent-decompose-claude.md`) — used as the system prompt for `POST /api/agentic-tasks/decompose`. Contains:
   - Rules for atomic, independent sub-tasks
   - Good prompt anatomy (files to modify, behavior, architecture fit, expected outcome)
   - Output format specification (JSON array)

## Config (DEPRECATED)

**⚠️ This config system is deprecated and no longer used.**

Both working agents and decompose agents use Claude Code CLI directly, which handles authentication via the local Claude CLI configuration (`claude auth login`).

The config file at `data/agent-config.json`, the config API routes (`/api/agentic-tasks/config`), and the Config panel in the UI are kept for reference only and may be removed in future versions.

<details>
<summary>Legacy config format (for reference)</summary>

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "api_key": "sk-ant-...",
    "base_url": "https://api.anthropic.com"
  }
}
```

Default provider was Anthropic. Also supported OpenAI-compatible APIs (OpenAI, OpenRouter, etc.).

The config API (`GET /api/agentic-tasks/config`) masked the API key in responses (`sk-ant-...1234`).

</details>

## UI Layout (`agent/page.tsx`)

Single client component file containing all sub-components.

```
┌─────────────────────────────────────────────────────────┐
│  Agent                                        [Config]  │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐              │
│  │ Describe what you want to build...    │ [Decompose]  │
│  │                                       │ [Direct]     │
│  └───────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────┤
│  Task Board (3x2 grid)                                  │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ Waiting      │ │ Developing   │ │ Waiting      │    │
│  │ for Dev      │ │              │ │ for Review   │    │
│  │  task-4 [⤢]  │ │  task-3 [⤢]  │ │  task-2 [⤢]  │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ Finished     │ │ Failed       │ │ Cancelled    │    │
│  │  task-1 [⤢]  │ │              │ │              │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Sub-components

- **PromptInput** — textarea + Decompose/Direct buttons. After decomposing, shows editable sub-task list with Confirm All / Cancel.
- **TaskBoard** — 3x2 grid of status columns, each with a colored dot header. Cards show title, time-ago, and enlarge button.
- **TaskCard** — colored left border per status, title, timestamp.
- **TaskDetailModal** — full-screen overlay with: header (title, status, ID, time), prompt display, error message (if failed), streaming output viewer (dark terminal-style, auto-scrolling), footer with Cancel/Delete buttons and branch/commit info. Polls output every 3s while task is `developing`.
- **ConfigPanel** — modal with provider dropdown, model input, API key input (password field), base URL input, Save button.

### Polling

The main page polls `GET /api/agentic-tasks/tasks` every 5 seconds. The detail modal additionally polls task output every 3 seconds while the task status is `developing`.

## API Reference

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/agentic-tasks/tasks` | List all tasks (optional `?status=` filter) |
| POST | `/api/agentic-tasks/tasks` | Create task (`{title, prompt, parent_objective?}`) |
| GET | `/api/agentic-tasks/tasks/:id` | Get single task detail |
| PUT | `/api/agentic-tasks/tasks/:id` | Update task (cancel, status change) |
| DELETE | `/api/agentic-tasks/tasks/:id` | Delete task and its output |
| GET | `/api/agentic-tasks/tasks/:id/output` | Get task output (`?limit=&offset=`) |
| POST | `/api/agentic-tasks/decompose` | LLM decomposes prompt into sub-tasks |
| GET | `/api/agentic-tasks/config` | Read config (API key masked) |
| PUT | `/api/agentic-tasks/config` | Update config (partial updates supported) |

## Common Pitfalls

- **Python module naming**: Importable Python files must use underscores (`agent_executor.py`), not hyphens. The daemon (`agent-daemon.py`) can use hyphens because it's run directly, not imported.
- **REPO_ROOT path depth**: The executor is at `workbench/scripts/agent_executor.py` — 3 levels below the git root, not 2. Use `dirname(dirname(dirname(__file__)))`.
- **Route exports**: Next.js route files (`route.ts`) can only export HTTP handlers. Shared logic must go in `src/lib/` modules (this is why `agent-config.ts` was extracted).
- **System Python version**: macOS system Python is 3.9. Use `from __future__ import annotations` for modern type hints, or use `Optional[X]`/`Union[X, Y]`.
- **API key masking**: `GET /api/agentic-tasks/config` masks the key. The UI never prefills the password field — it shows the masked value as a placeholder. Only send a new key when the user explicitly types one.
- **Stale lock recovery**: If the daemon crashes mid-execution, the lock may remain held. The daemon clears locks older than 30 minutes on startup and marks the associated task as `failed`.
