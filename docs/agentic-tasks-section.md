# Agentic Tasks Section — Technical Description

## Overview

The Agentic Tasks section is the task-orchestration UI for the workbench repo. It supports two task entry modes:

- direct worker task creation
- decompose task creation, where a separate agent breaks an objective into sub-tasks before execution

The web app does not execute tasks itself. It stores task state in SQLite and relies on the Python daemon and executor scripts to process queued work in git worktrees under the outer repo.

## Current Architecture

```text
Browser UI (src/app/agentic-tasks/page.tsx)
  ↓
Next.js API routes
  ↓
SQLite (data/workbench.db)
  agent_tasks
  agent_task_output
  agent_task_questions
  agent_lock
  ↓
Python daemon / executor scripts
  scripts/agent-daemon.py
  scripts/agent_executor.py
  scripts/task_handlers.py
  ↓
Git worktrees under ../.worktrees/
```

Scope: execution is centered on `/Users/ccnas/DEVELOPMENT/workbench`, not the separate `forester-repo`.

## Data Model

The task system uses `src/lib/agent-db.ts`.

### `agent_tasks`

Core task records for:

- `worker`
- `decompose`
- `investigation`
- `interactive-study`

Relevant fields:

- `status`
- `task_type`
- `parent_objective`
- `parent_task_id`
- `branch_name`
- `worktree_path`
- `error_message`
- `commit_id`
- `decompose_breakdown`
- `decompose_user_comment`
- `user_task_comment`
- timestamps

### `agent_task_output`

Append-only output stream for task execution and conversation-style events.

### `agent_task_questions`

Question/answer storage used for:

- worker clarification requests (`waiting_for_review`)
- decompose clarification requests (`decompose_waiting_for_answers`)

### `agent_lock`

Singleton lock row used by the execution system to serialize task processing.

## Task Types

### Worker Tasks

Worker tasks are standard implementation tasks created directly from the prompt box or generated from an approved decompose breakdown.

Typical lifecycle:

- `waiting_for_dev`
- `developing`
- `waiting_for_review` when questions are needed
- `finished` / `failed` / `cancelled`

### Decompose Tasks

Decompose tasks represent multi-step planning and review. They do not immediately create worker sub-tasks.

Current lifecycle:

- `decompose_understanding`
- `decompose_waiting_for_answers`
- `decompose_breaking_down`
- `decompose_waiting_for_approval`
- `decompose_approved`
- `decompose_waiting_for_completion`
- `decompose_reflecting`
- `decompose_complete`

The important current behavior is:

- `POST /api/agentic-tasks/decompose` creates a decompose task record and queues it
- the daemon performs the actual breakdown work
- the UI later fetches breakdown/questions from decompose-specific routes
- approving the breakdown creates child `worker` tasks with `parent_task_id`

## UI Structure

`src/app/agentic-tasks/page.tsx` contains the full section UI:

- prompt input with `Decompose` and `Direct` actions
- kanban-style task board grouped into six columns
- task detail modal with output log, worker questions, decompose approval/rejection, and sub-task review
- deprecated config modal

The board groups several internal statuses into broader UI columns:

- Waiting for Dev
- Developing
- Waiting for Review
- Finished
- Failed
- Cancelled

## Task Detail Behavior

The detail modal polls active tasks and conditionally loads more data depending on task type and status.

### Worker Tasks

- Fetch output from `/api/agentic-tasks/tasks/[id]/output`
- Fetch clarification questions from `/api/agentic-tasks/tasks/[id]/questions`
- Allow answer submission when status is `waiting_for_review`
- Allow post-completion user comments through `/api/agentic-tasks/tasks/[id]/comment`

### Decompose Tasks

- Fetch decompose details from `/api/agentic-tasks/decompose/[id]`
- Submit clarification answers to `/api/agentic-tasks/decompose/[id]/answers`
- Approve a breakdown through `/api/agentic-tasks/decompose/[id]/approve`
- Reject a breakdown with feedback through `/api/agentic-tasks/decompose/[id]/reject`
- Inspect child tasks through `/api/agentic-tasks/decompose/[id]/subtasks`

## API Surface

### Core Task Routes

| Route | Methods | Purpose |
|------|---------|---------|
| `/api/agentic-tasks/tasks` | `GET`, `POST` | List tasks / create direct worker task |
| `/api/agentic-tasks/tasks/[id]` | `GET`, `PUT`, `DELETE` | Task detail / update / delete |
| `/api/agentic-tasks/tasks/[id]/output` | `GET` | Paginated output stream |
| `/api/agentic-tasks/tasks/[id]/questions` | `GET`, `POST` | Worker clarification questions |
| `/api/agentic-tasks/tasks/[id]/comment` | `POST` | Store user comment on completed worker task |

### Decompose Routes

| Route | Methods | Purpose |
|------|---------|---------|
| `/api/agentic-tasks/decompose` | `POST` | Create queued decompose task |
| `/api/agentic-tasks/decompose/[id]` | `GET` | Get decompose task, questions, and breakdown |
| `/api/agentic-tasks/decompose/[id]/answers` | `POST` | Submit answers for decompose questions |
| `/api/agentic-tasks/decompose/[id]/approve` | `POST` | Approve breakdown and create child worker tasks |
| `/api/agentic-tasks/decompose/[id]/reject` | `POST` | Reject breakdown and send feedback back into the decompose flow |
| `/api/agentic-tasks/decompose/[id]/subtasks` | `GET` | List child worker tasks |

### Config Route

| Route | Methods | Purpose |
|------|---------|---------|
| `/api/agentic-tasks/config` | `GET`, `PUT` | Deprecated config surface retained for compatibility |

`src/lib/agent-config.ts` is explicitly marked deprecated. Current execution uses local Claude Code CLI auth instead of this stored config.

## Execution Notes

The daemon/executor implementation is outside the page component, but the current docs-aligned expectations are:

- queued tasks are processed from SQLite, not from in-memory UI state
- execution happens in git worktrees under `../.worktrees/`
- output is streamed back into `agent_task_output`
- worker and decompose tasks can pause for questions and resume later

This section should be read together with:

- `docs/agent-section.md` for agent definitions and filesystem-backed agent files
- `docs/monitor-section.md` for queue/active/report visibility

## Known Drift Removed From Older Docs

These older statements are no longer the current architecture:

- decompose work is not performed inline by the `POST /decompose` route
- the config panel is not the active auth path for execution
- the route surface is larger now because decompose review/approval has dedicated endpoints
