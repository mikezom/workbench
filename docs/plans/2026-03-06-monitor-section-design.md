# Monitor Section Design

## Overview

Create a new `/monitor` section that serves as a central control panel for all agent activity across the workbench. Refactor `agent-daemon.py` with a task handler registry pattern for maintainability and extensibility.

Three capabilities:
1. **Active Agent Monitoring** — real-time visibility into running Claude instances with process-level detail and termination control
2. **Unified Task Queue** — cross-section view of all queued/active/completed tasks regardless of type
3. **Investigation Tasks** — ad-hoc research questions that queue as tasks, produce markdown reports stored in the database

## Architecture

```
/monitor Section (New)
├── Tab: Active Agents — real-time process info, activity log, terminate
├── Tab: Task Queue — all tasks across all types, filterable
└── Tab: Reports — investigation report list + viewer

Refactored agent-daemon.py (~200 lines)
├── Task Handler Registry
│   ├── WorkerTaskHandler
│   ├── DecomposeTaskHandler
│   └── InvestigationTaskHandler
└── Monitoring Service
    ├── Process tracking (PID, subprocess tree)
    ├── Activity logging (files, commands, phases)
    └── Resource usage (CPU, memory)
```

## Database Schema Changes

### Extend `agent_tasks` table

Add `'investigation'` to the `task_type` CHECK constraint (alongside `'worker'`, `'decompose'`). Investigation tasks reuse existing statuses: `waiting_for_dev` -> `developing` -> `finished`/`failed`/`cancelled`.

SQLite cannot alter CHECK constraints, so this requires the same table-recreation migration pattern used for decompose statuses (see REFLECTION.md 2026-03-04).

### New table: `agent_monitoring`

Tracks currently-executing agent processes. One row per active task. Deleted when task completes.

```sql
CREATE TABLE agent_monitoring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
  process_id INTEGER,
  subprocess_pids TEXT,       -- JSON array of child PIDs
  current_phase TEXT,
  current_file TEXT,
  cpu_percent REAL,
  memory_mb REAL,
  started_at TEXT NOT NULL,
  last_updated TEXT NOT NULL
);
```

### New table: `investigation_reports`

Stores markdown reports produced by investigation tasks.

```sql
CREATE TABLE investigation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE REFERENCES agent_tasks(id) ON DELETE CASCADE,
  report_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### New table: `agent_activity_log`

Historical activity records for all tasks. Retained after task completes for historical analysis.

```sql
CREATE TABLE agent_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'file_read', 'file_write', 'command', 'phase_change', 'process_start', 'process_end'
  )),
  details TEXT NOT NULL  -- JSON
);
```

## Daemon Refactoring

### Current problem

`agent-daemon.py` is 614 lines with deeply nested if/else chains in the main loop. Each new task type adds another level of nesting. The worker, decompose, and decompose-resume/retry/reflect paths all duplicate the same lock-acquire/execute/handle-exception/release-lock pattern.

### Solution: Task Handler Registry

**New file: `scripts/task_handlers.py`**

```python
class TaskHandler(ABC):
    @abstractmethod
    def get_next_task(self, conn) -> dict | None:
        """Find next actionable task of this type."""

    @abstractmethod
    def execute(self, conn, task) -> None:
        """Execute the task. May raise CancelledError or QuestionsAsked."""

    @abstractmethod
    def on_finished(self, conn, task) -> str:
        """Return the status to set on successful completion."""

    @abstractmethod
    def on_questions(self, conn, task) -> str:
        """Return the status to set when questions are asked."""
```

Each handler encapsulates:
- How to find its next task (the query)
- How to execute it (the pipeline call)
- What status to set on success, questions, or cancellation

**Simplified `agent-daemon.py`:**

```python
handlers = [
    WorkerNewTaskHandler(),
    WorkerResumeHandler(),
    DecomposeStartHandler(),
    DecomposeResumeHandler(),
    DecomposeRetryHandler(),
    DecomposeReflectionHandler(),
    InvestigationHandler(),
]

while running:
    recover_stale_lock(conn)
    if not is_locked(conn):
        for handler in handlers:
            task = handler.get_next_task(conn)
            if task:
                execute_with_monitoring(conn, handler, task)
                break
    sleep_interruptible(POLL_INTERVAL)
```

The `execute_with_monitoring` function contains the shared logic: acquire lock, set status, call handler.execute(), handle exceptions, release lock, update monitoring. Written once instead of 7 times.

### Monitoring Service

**New file: `scripts/monitoring_service.py`**

Called by executors at key points:

```python
class MonitoringService:
    def start_tracking(self, conn, task_id, pid): ...
    def update_phase(self, conn, task_id, phase): ...
    def log_activity(self, conn, task_id, activity_type, details): ...
    def update_resources(self, conn, task_id): ...
    def stop_tracking(self, conn, task_id): ...
```

Resource monitoring uses `psutil` (or falls back to `ps` command if psutil unavailable). Updated every ~10 seconds during execution.

Activity data comes from parsing Claude CLI stream-json output, which already emits tool-use events including file reads/writes and command executions.

## Investigation Executor

**New function in `agent_executor.py`:**

`execute_investigation(conn, task)`:
1. Create worktree (read-only context, but worktree isolates CLAUDE.md injection)
2. Inject `data/agent-investigation-claude.md`
3. Invoke Claude with the investigation prompt
4. Parse Claude output to extract the markdown report
5. Store report in `investigation_reports` table
6. Clean up worktree (no merge — investigations don't modify code)

**New file: `data/agent-investigation-claude.md`**

System prompt for investigation agents:
- Read-only: do not modify files, do not commit
- Tools available: file reading, web search, documentation lookup
- Output format: structured markdown report with executive summary, findings, recommendations
- No skill loading (skills are for interactive/development contexts)

## Monitor Section UI

### Route: `/monitor`

Three tabs: Active Agents, Task Queue, Reports.

### Tab: Active Agents

Shows currently executing agent(s). Polls `GET /api/monitor/active` every 3 seconds.

Each active agent card displays:
- Task ID, title, type badge (Development/Investigation/Decompose)
- Running duration
- Current phase
- Process info (PID, CPU%, Memory MB)
- Current file being modified
- Recent activity log (last 10 entries, auto-scrolling)
- "View Full Output" button (links to task detail in /agent)
- "Terminate" button (red, with confirmation dialog)

When no agents are running: "No agents currently active" with queue summary.

### Tab: Task Queue

Unified view of all tasks across all types. Polls `GET /api/monitor/queue` every 5 seconds.

Filters: All | Development | Investigation | Decompose
Sections: Queued, In Progress, Completed Today, Failed

Each task row: ID, type badge, title, status, duration/age, section of origin.

### Tab: Reports

List of investigation reports. Fetches `GET /api/investigation/reports`.

Each report card: task ID, title, completion time, "View Report" button.

Report viewer: full-screen modal with rendered markdown, syntax highlighting for code blocks, auto-generated table of contents from headings.

"New Investigation" button opens a form with title + prompt fields, submits to `POST /api/investigation/create`.

## API Routes

```
GET  /api/monitor/active              — currently executing agents + monitoring data
GET  /api/monitor/queue               — all tasks, all types, with filters
POST /api/monitor/terminate/[taskId]  — send SIGTERM to agent process
GET  /api/monitor/activity/[taskId]   — activity log for a task

POST /api/investigation/create        — create investigation task
GET  /api/investigation/reports       — list all reports
GET  /api/investigation/reports/[taskId] — get specific report markdown
```

## Termination Flow

1. User clicks "Terminate" in Active Agents tab
2. Confirmation dialog: "Terminate agent working on '{title}'?"
3. `POST /api/monitor/terminate/{taskId}`
4. API reads PID from `agent_monitoring` table
5. Send `SIGTERM` to PID
6. Wait 5 seconds
7. If process still alive, send `SIGKILL`
8. Update task status to `cancelled`
9. Clean up worktree
10. Release lock

## Error Handling

- **Process termination failure**: If PID doesn't exist or can't be killed, log warning, mark task as failed, release lock
- **Stale monitoring records**: On daemon startup, delete any `agent_monitoring` rows without active processes
- **Report extraction failure**: If markdown report can't be parsed from Claude output, store raw output as report with `[Report extraction failed — raw output below]` header
- **Resource monitoring failure**: Best-effort; if CPU/memory can't be read, set to NULL, log warning, continue
- **psutil unavailable**: Fall back to `ps -o pcpu,rss -p {pid}` command parsing

## Migration Strategy

1. Refactor daemon with handler registry (no new features, behavior-preserving)
2. Add database tables (monitoring, reports, activity log) + migrate task_type constraint
3. Add monitoring service + wire into executors
4. Add investigation executor + CLAUDE.md
5. Build /monitor UI (Active Agents tab)
6. Build /monitor UI (Task Queue tab)
7. Build /monitor UI (Reports tab + investigation form)
8. Add API routes and wire frontend to backend
