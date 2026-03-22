# Interactive Study Section — Technical Description

## Overview

The Tutor section is a chat-style study interface built on top of the existing agent task system. A study session is stored as an `agent_tasks` row with `task_type = 'interactive-study'`, and the conversation history is stored in `agent_task_output`.

The section is intentionally lightweight:

- left sidebar for session list
- main chat panel for messages
- polling-based refresh for assistant responses
- filesystem-served teacher/student avatars from shared data

## Architecture

```text
UI
  src/app/interactive-study/page.tsx
  src/components/study/*
  ↓ fetch / poll
API routes
  /api/interactive-study/sessions
  /api/interactive-study/sessions/[id]
  /api/interactive-study/sessions/[id]/messages
  /api/interactive-study/avatars/[filename]
  ↓
agent-db storage
  agent_tasks
  agent_task_output
  ↓
daemon / agent execution path
  interactive-study tasks move to "developing" when a user sends a message
```

## Data Model

Interactive study reuses the agent task schema from `src/lib/agent-db.ts`.

### Session Record

Stored in `agent_tasks` with:

- `task_type = 'interactive-study'`
- `title` as the session title
- `prompt` as the initial topic / seed prompt

Current statuses used by this section:

- `waiting_for_review` — idle and ready for a new user message
- `developing` — assistant is responding
- `finished` — session explicitly ended in the UI
- `failed` / `cancelled` — exceptional states inherited from the shared task system

New sessions are immediately moved to `waiting_for_review` so the normal worker-task handler does not pick them up as generic queued development tasks.

### Message Record

Messages are stored in `agent_task_output`:

- `type = 'user'`
- `type = 'assistant'`

The message API filters out other output types and returns chat messages only.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/interactive-study/page.tsx` | Session list + chat page orchestration |
| `src/components/study/session-sidebar.tsx` | Sidebar with session list, status dots, delete action |
| `src/components/study/chat-interface.tsx` | Virtualized chat view, typing indicator, composer, end-session action |
| `src/components/study/message-bubble.tsx` | Per-message rendering |
| `src/app/api/interactive-study/sessions/route.ts` | List and create sessions |
| `src/app/api/interactive-study/sessions/[id]/route.ts` | Get, update, and delete a session |
| `src/app/api/interactive-study/sessions/[id]/messages/route.ts` | Get or append messages |
| `src/app/api/interactive-study/avatars/[filename]/route.ts` | Serve avatar images from shared data |

## API Surface

| Route | Methods | Purpose |
|------|---------|---------|
| `/api/interactive-study/sessions` | `GET`, `POST` | List sessions / create session |
| `/api/interactive-study/sessions/[id]` | `GET`, `PUT`, `DELETE` | Read session / rename or end / delete |
| `/api/interactive-study/sessions/[id]/messages` | `GET`, `POST` | Read filtered chat history / append user message |
| `/api/interactive-study/avatars/[filename]` | `GET` | Serve avatar assets from `../../shared-data/avatars/` |

## UI Behavior

### Session Sidebar

- New sessions are created from the sidebar
- Sessions are listed newest first
- Status is shown as:
  - pulsing blue dot for `developing`
  - neutral dot for idle states
  - green check icon for `finished`
- Delete is an inline button on hover

### Chat Area

- Messages are rendered with `react-virtuoso`
- The view auto-scrolls to the newest message
- The input auto-resizes up to one quarter of the panel height
- `Enter` sends, `Shift+Enter` inserts a newline
- While the assistant is responding, the composer is disabled and a typing indicator is shown
- Ending a session sets status to `finished`

## Polling Model

`src/app/interactive-study/page.tsx` polls every 2 seconds while a session is active:

- `GET /api/interactive-study/sessions/[id]/messages`
- `GET /api/interactive-study/sessions`

This keeps both the message timeline and sidebar status indicators in sync without websockets.

## Message Flow

```text
User sends message
  → POST /api/interactive-study/sessions/[id]/messages
  → appendTaskOutput(..., "user", content)
  → updateTask(..., { status: "developing" })
  → daemon / agent produces assistant output
  → assistant message appended to agent_task_output
  → session returns to idle state
  → UI polling picks up new message and updated status
```

## Shared Data

Avatar files are served from:

```text
/Users/ccnas/DEVELOPMENT/shared-data/avatars/
```

The current UI expects:

- `student.jpg`
- `teacher.png`

## Current Limitations

- The section reuses the generic task/output tables rather than a dedicated chat schema.
- Updates are polling-based, not streaming.
- Session state transitions are intentionally narrow; the session update route only allows status changes to `finished`.
