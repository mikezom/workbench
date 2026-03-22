# Monitor Section — Technical Description

## Overview

The Monitor section provides real-time visibility into the autonomous task execution system. It displays active agents, task queue status, and investigation reports.

## Route

- **Page**: `/monitor`
- **Component**: `src/app/monitor/page.tsx`

## Architecture

The Monitor section is a tabbed interface with three tabs:

1. **Active Agents** — Real-time view of currently executing tasks
2. **Task Queue** — Overview of all tasks by status (queued, in progress, completed, failed)
3. **Reports** — Investigation reports with creation and viewing capabilities

## Tabs

### Tab 1: Active Agents

Displays all currently executing tasks with real-time updates every 3 seconds. In practice this includes any task whose status is `developing`, `decompose_understanding`, `decompose_breaking_down`, or `decompose_reflecting`.

**Features:**
- Task ID, title, and type badge (Dev/Inv/Dec)
- Current execution phase
- Process ID with CPU and memory usage
- Current file being worked on
- Running duration (auto-updating every second)
- Terminate button for emergency stops

**API Endpoint:**
- `GET /api/monitor/active` — Returns list of active agents

**Data Structure:**
```typescript
interface ActiveAgent {
  task_id: number;
  title: string;
  status: string;
  task_type: string;
  started_at: string | null;
  prompt: string;
  process_id: number | null;
  subprocess_pids: string | null;
  current_phase: string | null;
  current_file: string | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  monitor_started_at: string | null;
  last_updated: string | null;
}
```

### Tab 2: Task Queue

Displays all tasks grouped by status with filtering by task type. Updates every 5 seconds.

**Status Groups:**
- **Queued** — `waiting_for_dev`, `decompose_understanding`, `decompose_approved`
- **In Progress** — `developing`, `decompose_breaking_down`, `decompose_reflecting`, `waiting_for_review`, `decompose_waiting_for_answers`, `decompose_waiting_for_approval`, `decompose_waiting_for_completion`
- **Completed** — `finished`, `decompose_complete`
- **Failed / Cancelled** — `failed`, `cancelled`

**Filters:**
- All
- Development (worker tasks)
- Investigation
- Decompose

**API Endpoint:**
- `GET /api/monitor/queue` — Returns all tasks
- `GET /api/monitor/queue?type=worker` — Filter by task type

**Data Structure:**
```typescript
interface QueueTask {
  id: number;
  title: string;
  status: string;
  task_type: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  parent_task_id: number | null;
}
```

### Tab 3: Reports

Investigation reports interface with creation form and report viewer.

**Features:**
- List of all investigation reports
- "New Investigation" button to create new investigation tasks
- Investigation creation form (title + prompt)
- Report viewer that currently shows raw markdown inside a `<pre>` block

**API Endpoints:**
- `GET /api/investigation/reports` — List all reports
- `GET /api/investigation/reports/[taskId]` — Get full report
- `POST /api/investigation/create` — Create new investigation task

**Data Structures:**
```typescript
interface ReportSummary {
  task_id: number;
  title: string;
  status: string;
  created_at: string;
}

interface FullReport {
  task_id: number;
  title: string;
  prompt: string;
  status: string;
  report_markdown: string;
  created_at: string;
  task_created_at: string;
}
```

## UI Components

### TypeBadge
Displays task type with color coding:
- **Dev** (blue) — Development/worker tasks
- **Inv** (purple) — Investigation tasks
- **Dec** (orange) — Decompose tasks

### StatusBadge
Displays task status with color coding:
- **Queued** (yellow) — Waiting to start
- **In Progress** (blue) — Currently executing
- **Completed** (green) — Successfully finished
- **Failed/Cancelled** (red) — Error or user cancellation

### InvestigationForm
Form for creating new investigation tasks:
- Title input
- Prompt textarea
- Submit and Cancel buttons

### ReportViewer
Displays full investigation report:
- Back button to return to list
- Report title and metadata
- Raw markdown content in a scrollable `<pre>` container

## Database Schema

The Monitor section reads from existing tables:

### `agent_tasks`
Primary task table with all task information including monitoring fields.

### `agent_monitoring`
Real-time monitoring data for active tasks:
```sql
CREATE TABLE agent_monitoring (
  task_id INTEGER PRIMARY KEY REFERENCES agent_tasks(id) ON DELETE CASCADE,
  process_id INTEGER,
  subprocess_pids TEXT,
  current_phase TEXT,
  current_file TEXT,
  cpu_percent REAL,
  memory_mb REAL,
  started_at TEXT,
  last_updated TEXT
);
```

### `investigation_reports`
Investigation task reports:
```sql
CREATE TABLE investigation_reports (
  task_id INTEGER PRIMARY KEY REFERENCES agent_tasks(id) ON DELETE CASCADE,
  report_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `agent_activity_log`
Activity log for agent actions (future use):
```sql
CREATE TABLE agent_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata TEXT
);
```

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/monitor/active` | List all active agents with monitoring data |
| GET | `/api/monitor/queue` | List all tasks (optional `?type=` filter) |
| POST | `/api/monitor/terminate/[taskId]` | Terminate a running agent |
| GET | `/api/monitor/activity/[taskId]` | Get activity log for a task |
| POST | `/api/investigation/create` | Create new investigation task |
| GET | `/api/investigation/reports` | List all investigation reports |
| GET | `/api/investigation/reports/[taskId]` | Get full investigation report |

## Polling Behavior

- **Active Agents tab**: Polls every 3 seconds + updates duration display every 1 second
- **Task Queue tab**: Polls every 5 seconds
- **Reports tab**: No polling (static list, refreshes on creation)

## Integration with Agentic Tasks

The Monitor section provides read-only visibility into tasks created in the Agentic Tasks section. It does not create or modify tasks directly (except for investigation tasks and termination).

**Task Flow:**
1. User creates task in Agentic Tasks section (`/agentic-tasks`)
2. Task appears in Monitor Queue tab (`/monitor` → Task Queue)
3. When daemon picks up task, it appears in Active Agents tab
4. On completion, task moves to Completed section in Queue tab
5. Investigation reports appear in Reports tab

## Common Patterns

### Time Formatting
Duration display uses `formatDuration()` helper:
- Shows hours, minutes, seconds for running tasks
- Auto-updates every second via tick state
- Handles null/missing timestamps gracefully

### Status Mapping
Status badges map multiple internal statuses to user-friendly labels:
- Multiple "in progress" statuses → "In Progress" badge
- Multiple "queued" statuses → "Queued" badge
- Consistent color coding across all views

### Error Handling
All API calls wrapped in try-catch with console.error logging. Failed fetches result in empty arrays/null states rather than UI crashes.
