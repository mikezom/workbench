# Agent Section — Technical Description

## Overview

The Agent section is an autonomous task execution system built around Claude Code CLI. A user submits a natural-language objective via the web UI; an LLM decomposes it into atomic sub-tasks; a Python polling daemon picks them up one-at-a-time and runs Claude Code in isolated git worktrees. On success, changes are merged to `main` and knowledge is accumulated in project docs.

The system comprises three modules:

- **Module A** — Web UI + task decomposition (Next.js)
- **Module B** — Polling daemon (Python + launchd)
- **Module C** — Execution pipeline (Python, invokes Claude Code CLI)

## Architecture

```
User (browser)
  │
  ▼
Module A: Next.js UI + API Routes
  │  POST /api/agent/tasks   → create task
  │  POST /api/agent/decompose → LLM breaks objective into sub-tasks
  │  GET  /api/agent/tasks   → list tasks (polled by UI)
  │  GET  /api/agent/tasks/[id]/output → stream task output
  │  PUT  /api/agent/tasks/[id] → cancel / update status
  │
  ▼
SQLite (data/workbench.db) — tasks table
  │
  ▲ poll
  │
Module B: Python Polling Daemon (launchd)
  │  Checks for status='waiting_for_dev'
  │  Acquires global lock
  │  Passes task to Module C
  │
  ▼
Module C: Execution Pipeline (Python)
  │  1. git worktree add
  │  2. claude -p [prompt] --dangerously-skip-permissions \
  │       --output-format stream-json --verbose
  │  3. Run tests, resolve conflicts (iteratively)
  │  4. Merge to main, clean up worktree
  │  5. Update knowledge docs (REFLECTION.md, PROGRESS.md, etc.)
  │  6. Set status='waiting_for_review', release lock
```

## Scope

Module C operates **only** on the workbench repo (`/Users/ccnas/DEVELOPMENT/workbench/`) and its sub-modules. It does not operate on arbitrary external repos.

## Task Statuses

| Status              | Meaning                                                    |
|---------------------|------------------------------------------------------------|
| `waiting_for_dev`   | Queued, not yet picked up by the daemon                    |
| `developing`        | Currently being executed by an agent in a worktree         |
| `waiting_for_review`| Agent finished; awaiting user review before final merge    |
| `finished`          | User approved; merged to main                              |
| `failed`            | Execution failed after exhausting resolution attempts      |
| `cancelled`         | User cancelled the task                                    |

Tasks are **atomic** — no dependencies between tasks. Each sub-task from decomposition is independent and can be executed in any order.

## Module A: Web UI + Task Decomposition

### UI Layout (`/agent` page)

```
┌─────────────────────────────────────────────────────────┐
│  Prompt Input                                           │
│  ┌───────────────────────────────────────────┐ [Submit] │
│  │ Describe what you want to build or fix... │          │
│  └───────────────────────────────────────────┘          │
├─────────────────────────────────────────────────────────┤
│  Task Board                                             │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │Waiting   │ │Developing│ │Waiting   │                │
│  │for Dev   │ │          │ │for Review│                │
│  │          │ │ task-3   │ │          │                │
│  │ task-4   │ │ [⤢]      │ │ task-2   │                │
│  │ task-5   │ │          │ │ [⤢]      │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │Finished  │ │Failed    │ │Cancelled │                │
│  │          │ │          │ │          │                │
│  │ task-1   │ │          │ │          │                │
│  │ [⤢]      │ │          │ │          │                │
│  └──────────┘ └──────────┘ └──────────┘                │
└─────────────────────────────────────────────────────────┘
```

- Each task card shows: title, status, timestamps
- **[⤢] enlarge button**: Opens a detail/interaction view for that task
  - Shows streaming agent output (from `--output-format stream-json`)
  - Allows the user to interact while the task is executing
  - Cancel button to abort a running task at any time

### Task Decomposition

When the user submits a prompt:

1. Call the configured LLM API to decompose the objective into atomic sub-tasks
2. Present the sub-tasks to the user for review/edit before queuing
3. On user confirmation, insert each sub-task into the `tasks` table with `status='waiting_for_dev'`

The LLM model/provider is user-configurable via the UI (see Config below).

### API Routes

| Route                            | Method | Purpose                                      |
|----------------------------------|--------|----------------------------------------------|
| `/api/agent/tasks`               | GET    | List all tasks (with optional status filter)  |
| `/api/agent/tasks`               | POST   | Create task(s) — either raw or via decompose  |
| `/api/agent/tasks/[id]`          | GET    | Get single task detail + output               |
| `/api/agent/tasks/[id]`          | PUT    | Update task (cancel, status change)           |
| `/api/agent/tasks/[id]`          | DELETE | Delete a task                                 |
| `/api/agent/tasks/[id]/output`   | GET    | Stream/poll execution output for a task       |
| `/api/agent/decompose`           | POST   | LLM decomposes a prompt into sub-tasks        |
| `/api/agent/config`              | GET    | Read agent config                             |
| `/api/agent/config`              | PUT    | Update agent config                           |

### Config File

Stored at `workbench/data/agent-config.json`:

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

The UI provides a settings/config panel where the user can:
- Select provider (Anthropic, OpenAI, etc.)
- Enter API key
- Set base URL (for proxies or alternative endpoints)
- Choose model

This file is **gitignored** (contains secrets).

## Module B: Polling Daemon (Python + launchd)

### Script Location

`scripts/agent-daemon.py`

### Behavior

```python
# Pseudocode
while True:
    if not is_locked():
        task = get_next_pending_task()  # status='waiting_for_dev', ordered by created_at
        if task:
            acquire_lock(task.id)
            set_task_status(task.id, 'developing')
            try:
                execute_task(task)  # Module C
                set_task_status(task.id, 'waiting_for_review')
            except CancelledError:
                set_task_status(task.id, 'cancelled')
            except Exception as e:
                set_task_status(task.id, 'failed', error=str(e))
            finally:
                release_lock()
    sleep(POLL_INTERVAL)  # e.g., 5 seconds
```

### Global Lock

- Stored in the `tasks` DB or a separate `agent_lock` table
- Guarantees only one agent runs at a time
- Released on task completion, failure, or cancellation

### Cancellation

- The UI sets a `cancelled` flag in the DB (via PUT `/api/agent/tasks/[id]`)
- The daemon checks this flag periodically during execution
- On detection, kills the Claude Code subprocess and cleans up the worktree

### launchd Configuration

Plist at `~/Library/LaunchAgents/com.workbench.agent-daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.workbench.agent-daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/ccnas/DEVELOPMENT/workbench/scripts/agent-daemon.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/ccnas/DEVELOPMENT/workbench</string>
    <key>StandardOutPath</key>
    <string>/Users/ccnas/DEVELOPMENT/workbench/logs/agent-daemon.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/ccnas/DEVELOPMENT/workbench/logs/agent-daemon.err.log</string>
</dict>
</plist>
```

Load/unload:
```bash
launchctl load ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
launchctl unload ~/Library/LaunchAgents/com.workbench.agent-daemon.plist
```

## Module C: Execution Pipeline

### Lifecycle of a Single Task

```
1. Create worktree
   git worktree add .worktrees/task-<id> -b task/<short-desc> main

2. Invoke Claude Code
   cd .worktrees/task-<id>
   claude -p "<task prompt>" \
     --dangerously-skip-permissions \
     --output-format stream-json \
     --verbose

3. Stream output
   - Parse stream-json lines and write to DB/log file
   - Check for cancellation flag periodically

4. On agent completion — rebase onto main
   git checkout main && git pull
   git checkout task/<short-desc>
   git rebase main

5. Conflict resolution (if rebase fails)
   - "Unstaged changes" error → commit or stash first
   - Merge conflicts:
     a. git status to identify conflicting files
     b. Read both versions, understand intentions
     c. Manually resolve (invoke claude for assistance)
     d. git add <resolved-files>
     e. git rebase --continue
   - Repeat until rebase completes

6. Run tests
   npm test (or equivalent)
   - If tests fail:
     a. Analyze the failure output
     b. Fix the bugs (invoke claude again if needed)
     c. Rerun tests until all pass
     d. git commit -m "fix: <description>"
   - Do NOT give up easily — exhaust resolution attempts

7. Mark as waiting_for_review
   - Status set to 'waiting_for_review'
   - User reviews the branch in the UI

8. On user approval → merge
   git checkout main
   git merge task/<short-desc>
   git worktree remove .worktrees/task-<id>
   git branch -d task/<short-desc>

9. Knowledge accumulation
   - Update REFLECTION.md with lessons learned
   - Update PROGRESS.md and DETAILED_PROGRESS.md
   - Update CLAUDE.md files (with user approval):
     - Working agent CLAUDE.md: instructions for code-writing agents
     - Task-dividing agent CLAUDE.md: instructions for decomposition LLM
   - Commit knowledge updates

10. Release global lock
```

### Worktree Management

- Worktrees are created under `/Users/ccnas/DEVELOPMENT/workbench/.worktrees/`
- Branch naming: `task/<short-description>` (derived from task title)
- On cancellation or failure: worktree is removed, branch deleted
- `.worktrees/` directory is gitignored

### Claude Code Invocation

```bash
claude -p "<prompt>" \
  --dangerously-skip-permissions \
  --output-format stream-json \
  --verbose
```

The prompt includes:
- The specific sub-task description
- Context from the working agent's CLAUDE.md
- Relevant file paths or module references

Output is streamed as JSON lines, parsed by the daemon, and stored for the UI to display.

### CLAUDE.md Files (Two Separate Files)

1. **Working Agent CLAUDE.md** — Instructions for the Claude Code agent executing tasks in worktrees. Contains:
   - Coding conventions, file structure, testing requirements
   - Known pitfalls from REFLECTION.md
   - Project-specific patterns

2. **Task-Dividing Agent CLAUDE.md** — Instructions/system prompt for the LLM performing task decomposition. Contains:
   - How to break objectives into atomic sub-tasks
   - What constitutes a good sub-task (scoped, testable, independent)
   - Project structure knowledge for accurate scoping

Both files are updated during knowledge accumulation (step 9), but **CLAUDE.md updates require user approval** before being committed.

## Database Schema

Added to `data/workbench.db` (extends existing schema in `src/lib/db.ts`):

### `agent_tasks`

```sql
CREATE TABLE IF NOT EXISTS agent_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting_for_dev'
    CHECK (status IN (
      'waiting_for_dev', 'developing', 'waiting_for_review',
      'finished', 'failed', 'cancelled'
    )),
  parent_objective TEXT,          -- original user prompt that generated this task
  branch_name TEXT,               -- e.g., 'task/add-login-button'
  worktree_path TEXT,             -- e.g., '.worktrees/task-7'
  error_message TEXT,             -- populated on failure
  commit_id TEXT,                 -- final merge commit SHA
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);
```

### `agent_task_output`

```sql
CREATE TABLE IF NOT EXISTS agent_task_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL,              -- 'stdout', 'stderr', 'system', 'assistant', 'tool'
  content TEXT NOT NULL
);
```

### `agent_lock`

```sql
CREATE TABLE IF NOT EXISTS agent_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- singleton row
  locked INTEGER NOT NULL DEFAULT 0,
  task_id INTEGER REFERENCES agent_tasks(id),
  locked_at TEXT
);
```

## Key Files (Planned)

| File | Purpose |
|------|---------|
| `src/app/agent/page.tsx` | Agent UI — prompt input, task board, detail view |
| `src/app/api/agent/tasks/route.ts` | Task list + create |
| `src/app/api/agent/tasks/[id]/route.ts` | Task detail, update, delete |
| `src/app/api/agent/tasks/[id]/output/route.ts` | Stream/poll task execution output |
| `src/app/api/agent/decompose/route.ts` | LLM task decomposition |
| `src/app/api/agent/config/route.ts` | Agent config CRUD |
| `src/lib/agent-db.ts` | Agent-specific DB operations (or extend db.ts) |
| `scripts/agent-daemon.py` | Polling daemon (Module B + C) |
| `scripts/agent-executor.py` | Execution pipeline logic (Module C), imported by daemon |
| `data/agent-config.json` | LLM provider/model/API key config (gitignored) |
| `data/agent-working-claude.md` | CLAUDE.md for the working agent |
| `data/agent-decompose-claude.md` | CLAUDE.md for the task-dividing agent |
| `logs/agent-daemon.out.log` | Daemon stdout log |
| `logs/agent-daemon.err.log` | Daemon stderr log |
| `~/Library/LaunchAgents/com.workbench.agent-daemon.plist` | launchd plist |

## Error Handling Philosophy

**Do not give up easily.** The system must be resilient:

- **Rebase conflicts**: Resolve iteratively — read both sides, merge manually, continue rebase, repeat until done.
- **Test failures**: Analyze, fix, rerun — loop until all tests pass, commit each fix.
- **Agent errors**: Retry with additional context before marking as failed.
- Only mark `failed` after genuinely exhausting resolution attempts.

## Future Considerations

- Parallel agent execution (multiple worktrees, multiple locks)
- Task priority / reordering
- Agent output search / filtering in the UI
- Integration with the Forest section (auto-generate knowledge trees from completed tasks)
- Webhook/notification support when tasks complete
