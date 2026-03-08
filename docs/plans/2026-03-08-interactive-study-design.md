# Interactive Study Section — Design Document

## Overview

The Interactive Study section is a chat-based learning interface that uses Socratic dialogue to help users study topics. It reuses the Agentic Tasks infrastructure with a new task type `'interactive-study'`. The agent guides users through topics with questions, generates flashcards from conversations, and can read flashcard memory progress.

## User Requirements

- Chat interface with Socratic dialogue (agent guides learning with questions)
- Session-based conversations (saved with title/timestamp, reviewable)
- Generate flashcards from conversations and add to Study section
- Read flashcard memory progress (FSRS state, review history)
- Avatar support (user + agent avatars in chat)
- LaTeX rendering (inline `$...$` and block `$$...$$`)
- Future: Import book folders (markdown), create study groups from books

## Architecture

### Reuse Agentic Tasks Infrastructure

- Extend `agent_tasks` table with new task_type: `'interactive-study'`
- Reuse `agent_task_output` for streaming messages
- Reuse daemon polling and executor pipeline
- Reuse streaming infrastructure (real-time output)

### New Components

- `/interactive-study` page with chat-like UI (not task board)
- Session list sidebar (shows past study sessions)
- Chat interface (messages with avatars + LaTeX rendering)
- New executor handler for `interactive-study` task type
- CLAUDE.md location: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/CLAUDE.md`
- Config location: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/config.json`

### Data Flow

```
User starts new session
  ↓
Create agent_task with type='interactive-study', status='waiting_for_dev'
  ↓
Daemon picks up task, creates worktree
  ↓
Executor injects CLAUDE.md from /Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/
  ↓
Invoke Claude CLI with streaming
  ↓
Stream output to agent_task_output
  ↓
UI polls and renders messages with LaTeX + avatars
  ↓
User sends follow-up → task continues (like questions flow)
```

## Database Schema

### Extend `agent_tasks` table

- Add `'interactive-study'` to task_type CHECK constraint
- No new columns needed (reuse existing fields)

**Session metadata stored in task fields:**
- `title`: Session title (e.g., "Studying Category Theory - 2026-03-08")
- `description`: Initial user prompt or topic
- `status`: Uses existing statuses (`waiting_for_dev`, `developing`, `finished`)

### Reuse `agent_task_output` table

**Messages stored in existing table:**
- `output_type`: 'user' for user messages, 'agent' for agent responses
- `content`: Message text (may contain LaTeX)
- `sequence`: Message order in conversation

### Agent Configuration

- CLAUDE.md: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/CLAUDE.md`
- Config: `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/config.json`
  - Model, API key, system prompt
  - User avatar path
  - Agent avatar path

**No new tables needed** — fully reuses existing infrastructure.

## UI Components

### Page Layout

```
┌──────────────────────────────────────────────┐
│ Nav (48px, from root layout)                 │
├────────────┬─────────────────────────────────┤
│ Sessions   │  Chat Interface                 │
│ Sidebar    │                                 │
│ (240px)    │  ┌─────────────────────────┐   │
│            │  │ [Avatar] Agent message  │   │
│ [+ New]    │  │ with LaTeX: $x^2$       │   │
│            │  └─────────────────────────┘   │
│ Session 1  │                                 │
│ Session 2  │  ┌─────────────────────────┐   │
│ Session 3  │  │ User message [Avatar]   │   │
│            │  └─────────────────────────┘   │
│            │                                 │
│            │  [Type message...] [Send]       │
└────────────┴─────────────────────────────────┘
```

### Components

- **SessionSidebar**: List of past sessions, "New Session" button
- **ChatInterface**: Message list + input area
- **MessageBubble**: Avatar + content with LaTeX rendering
- **LatexRenderer**: Wraps KaTeX for inline `$...$` and block `$$...$$`

### Avatar System

- Agent avatar: Default icon (robot/assistant), stored in `public/avatars/agent-default.svg`
- User avatar: Configurable in settings, stored in config
- Fallback to initials if avatar fails to load

## API Routes

### Implemented Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/interactive-study/sessions` | Create new session |
| GET | `/api/interactive-study/sessions` | List all sessions |
| GET | `/api/interactive-study/sessions/[id]` | Get session details |
| POST | `/api/interactive-study/sessions/[id]/messages` | Send user message |
| GET | `/api/interactive-study/sessions/[id]/messages` | Get messages (with polling) |
| DELETE | `/api/interactive-study/sessions/[id]` | Delete session |

### Future API Stubs (not implemented)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/interactive-study/books` | Import book folder |
| POST | `/api/interactive-study/cards` | Generate cards from conversation |
| GET | `/api/interactive-study/progress` | Read flashcard memory progress |

## Data Flow Details

### Creating a New Session

```
User clicks "New Session"
  ↓
POST /api/interactive-study/sessions
  { title: "New Study Session", description: "" }
  ↓
Creates agent_task with type='interactive-study', status='waiting_for_dev'
  ↓
Returns { sessionId, title, status }
  ↓
UI navigates to session, shows empty chat
```

### Sending a Message

```
User types message and clicks Send
  ↓
POST /api/interactive-study/sessions/[id]/messages
  { content: "Explain category theory" }
  ↓
Insert user message into agent_task_output (output_type='user')
  ↓
Update task status to 'developing' (triggers daemon)
  ↓
Return { messageId }
  ↓
UI starts polling for agent response
```

### Agent Execution

```
Daemon polls, finds task with status='developing'
  ↓
Executor creates worktree
  ↓
Inject CLAUDE.md from /Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/
  ↓
Load conversation history from agent_task_output
  ↓
Invoke Claude CLI with streaming (--output-format stream-json)
  ↓
Stream chunks to agent_task_output (output_type='agent')
  ↓
When complete, set status='waiting_for_dev' (ready for next message)
```

### Polling for Updates

```
UI polls GET /api/interactive-study/sessions/[id]/messages?since=[sequence]
  ↓
Returns new messages since last poll
  ↓
UI renders with LaTeX + avatars
  ↓
Continues polling until status != 'developing'
```

## Error Handling

### Agent Execution Failures

- If Claude CLI fails (API error, timeout), executor logs error to agent_task_output
- Task status set to 'failed'
- UI displays error message in chat with retry button
- User can retry (creates new task with same conversation history)

### Network/Polling Failures

- If polling fails, UI shows "Connection lost" banner
- Auto-retry with exponential backoff (1s, 2s, 4s, max 10s)
- User can manually refresh

### LaTeX Rendering Errors

- If KaTeX fails to parse, display raw LaTeX with error indicator
- Don't break the entire message bubble

### Session Not Found

- If session ID invalid, redirect to sessions list with error toast

### Concurrent Messages

- Prevent sending new message while agent is responding (disable input)
- Show "Agent is typing..." indicator

### Long Conversations

- Context window limit: Warn user after 50 messages
- Option to "Start fresh session" (creates new task, links to previous)

### Avatar Loading Failures

- Fallback to default avatar if custom avatar fails to load
- Show initials if no avatar available

## Testing Strategy

### Unit Tests

- LaTeX renderer component (inline/block rendering, error cases)
- Message bubble component (avatar positioning, user vs agent styling)
- Session list filtering/sorting
- API route handlers (create session, send message, get messages)

### Integration Tests

- Full message flow: send message → poll → receive response
- Session creation and retrieval
- Error handling (failed tasks, network errors)
- LaTeX rendering in real messages

### Manual Testing

- Streaming response display (smooth rendering)
- Avatar display (user + agent)
- Session switching (no message leakage between sessions)
- Mobile responsive layout
- Dark mode compatibility

### Future Testing (when features implemented)

- Book import and parsing
- Card generation from conversation
- Memory progress reading

### Test Database

- Reuse existing test isolation (in-memory SQLite for tests)
- Mock Claude API responses for executor tests

## Key Design Decisions

1. **Reuse Agentic Pipeline**: Leverages proven infrastructure (daemon, executor, streaming) instead of building new chat backend
2. **Task lifecycle**: Each study session is one long-running task (not finished until user ends session)
3. **Message continuity**: Use questions/answers pattern from Agentic Tasks for back-and-forth dialogue
4. **Streaming**: Reuse existing `agent_task_output` streaming (no new infrastructure needed)
5. **LaTeX**: Client-side KaTeX rendering on message display
6. **Avatars**: User avatar (configurable) + Agent avatar in message bubbles
7. **Config location**: Store in `/Users/ccnas/DEVELOPMENT/shared-data/agent/interactive-study/` (outside project, consistent with image storage)
8. **API stubs**: Leave endpoints for future features (book import, card generation, memory progress) with clear TODOs

## Future Features (Deferred)

- Book folder import (markdown files)
- Create study groups from books
- Generate flashcards from conversation
- Read flashcard memory progress
- Agent can reference specific cards during conversation
- Multi-book context (agent can reference multiple imported books)
