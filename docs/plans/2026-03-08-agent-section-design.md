# Agent Section Design Document

**Date**: 2026-03-08
**Status**: Approved (revised)

## Overview

The Agent section provides a management interface for configurable agent definitions. Each agent is a self-contained entity with four components stored on the filesystem, indexed by SQLite. The section uses a list + detail panel layout for browsing and editing agents.

## Agent Model

An agent consists of four parts:

1. **Persona** — `CLAUDE.md` file defining the agent's behavior and instructions
2. **Memory** — `REFLECTION.md` file tracking the agent's learned knowledge
3. **Skills** — Per-agent copies of skill files (SKILL.md) in a `skills/` subdirectory
4. **Tools** — `mcp-config.json` in Claude Code native format for MCP server configs

## Goals

- CRUD operations for agent definitions
- Edit persona, memory, skills, and tools through the UI
- Per-agent skill copies (agents can have modified versions of shared skills)
- Self-contained agent directories for easy worktree setup

## Non-Goals

- Running agent tasks (handled by Agentic Tasks section)
- Real-time agent execution monitoring (handled by Monitor section)
- Changing agents on existing tasks (agent-task association is mostly static)

## Data Model

### SQLite Table

The database serves as an **index only** — no content storage:

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link to existing agent_tasks
ALTER TABLE agent_tasks ADD COLUMN agent_id INTEGER REFERENCES agents(id);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id);
```

### Filesystem

Each agent lives at `DEVELOPMENT/shared-data/agent/<name>/`:

```
shared-data/agent/worker/
├── CLAUDE.md           # persona
├── REFLECTION.md       # memory
├── skills/             # per-agent skill copies
│   ├── agent-understand-task/SKILL.md
│   └── agent-write-failing-test/SKILL.md
└── mcp-config.json     # MCP tool config (Claude Code native format)
```

`mcp-config.json` uses Claude Code's native format:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-chrome-devtools"]
    }
  }
}
```

Creating an agent creates both a DB row and the directory. Deleting an agent removes both.

## UI Layout

**Route:** `/agent`

```
+------------------------+--------------------------------------+
|  Agent List (left)     |  Agent Detail (right)                |
|                        |                                      |
|  [+ New Agent]         |  Name (editable) | Description       |
|                        |  [Delete]                            |
|  > worker       (sel)  |                                      |
|    decompose           |  [Persona] [Memory] [Skills] [Tools] |
|    researcher          |                                      |
|                        |  +----------------------------------+|
|                        |  | <textarea>                       ||
|                        |  |                                  ||
|                        |  |  CLAUDE.md content...            ||
|                        |  |                                  ||
|                        |  +----------------------------------+|
|                        |                                      |
|                        |  [Save]                              |
+------------------------+--------------------------------------+
```

### Left Panel — Agent List

- Scrollable list of agent names + descriptions
- "New Agent" button at top
- Click to select, highlights active agent

### Right Panel — Agent Detail (4 tabs)

**Top:** Agent name (editable), description (editable), delete button.

1. **Persona tab** — Textarea editing CLAUDE.md. Save button writes to disk.
2. **Memory tab** — Textarea editing REFLECTION.md. Save button writes to disk.
3. **Skills tab** — List of current skills, each expandable to view/edit its SKILL.md. "Add skill" picker scans available skills from project `skills/` directories. Remove button per skill.
4. **Tools tab** — Textarea editing mcp-config.json. Save button writes to disk.

## API Routes

### Agent CRUD

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents` | List all agents (from DB) |
| POST | `/api/agents` | Create agent (DB row + directory) |
| GET | `/api/agents/[id]` | Get agent metadata from DB |
| PUT | `/api/agents/[id]` | Update name/description in DB |
| DELETE | `/api/agents/[id]` | Delete agent (DB row + directory) |

### File Content

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents/[id]/persona` | Read CLAUDE.md from disk |
| PUT | `/api/agents/[id]/persona` | Write CLAUDE.md to disk |
| GET | `/api/agents/[id]/memory` | Read REFLECTION.md from disk |
| PUT | `/api/agents/[id]/memory` | Write REFLECTION.md to disk |
| GET | `/api/agents/[id]/tools` | Read mcp-config.json from disk |
| PUT | `/api/agents/[id]/tools` | Write mcp-config.json to disk |

### Skills Management

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agents/[id]/skills` | List skills in agent's skills/ dir |
| POST | `/api/agents/[id]/skills` | Add skill (copy from source) |
| DELETE | `/api/agents/[id]/skills/[name]` | Remove skill (delete from agent dir) |
| GET | `/api/agents/[id]/skills/[name]` | Read skill SKILL.md content |
| PUT | `/api/agents/[id]/skills/[name]` | Update skill SKILL.md content |
| GET | `/api/agents/available-skills` | List skills from project skills/ dirs (for picker) |

## Integration with Existing System

### Agent Executor Changes

The agent executor (`agent_executor.py`) currently copies hardcoded `agent-working-claude.md` into worktrees. It should be updated to:

1. Look up the agent's directory from `shared-data/agent/<name>/`
2. Copy `CLAUDE.md` into the worktree as the persona
3. Copy `skills/` into the worktree's skills directory
4. Copy `mcp-config.json` into the worktree's Claude config
5. After task completion, copy updated `REFLECTION.md` back to the agent's directory
6. Never commit `CLAUDE.md` or `REFLECTION.md` to the repo

### Agent Workflow (for reference)

1. Setup script creates git worktree, copies persona/memory/skills/tools from `shared-data/agent/<name>/`
2. Agent runs, commits work
3. Setup script runs tests (agent debugs up to N times)
4. On success: agent commits code files, cleanup script updates REFLECTION.md back to agent directory
5. Cleanup: terminate worktree

### What Does NOT Change

- Agentic Tasks section remains the place to create/manage tasks
- Monitor section remains the place to observe execution
- Daemon polling loop and lock management stay the same
- Task statuses and decompose workflow stay the same

## Database Functions (agent-db.ts)

```typescript
// Agent CRUD
createAgent(name: string, description?: string): Agent
getAgent(id: number): Agent | null
getAgentByName(name: string): Agent | null
getAllAgents(): Agent[]
updateAgent(id: number, updates: { name?: string; description?: string }): Agent
deleteAgent(id: number): boolean

// Filesystem helpers (separate file: agents-fs.ts)
getAgentDir(name: string): string
readAgentFile(name: string, filename: string): string | null
writeAgentFile(name: string, filename: string, content: string): void
listAgentSkills(name: string): string[]
addAgentSkill(name: string, skillName: string, sourceDir: string): void
removeAgentSkill(name: string, skillName: string): void
readAgentSkill(name: string, skillName: string): string | null
writeAgentSkill(name: string, skillName: string, content: string): void
getAvailableSkills(): { name: string; path: string }[]
```

## Files to Create/Modify

**New files:**
- `src/app/agent/page.tsx` (replace placeholder)
- `src/app/api/agents/route.ts`
- `src/app/api/agents/[id]/route.ts`
- `src/app/api/agents/[id]/persona/route.ts`
- `src/app/api/agents/[id]/memory/route.ts`
- `src/app/api/agents/[id]/tools/route.ts`
- `src/app/api/agents/[id]/skills/route.ts`
- `src/app/api/agents/[id]/skills/[name]/route.ts`
- `src/app/api/agents/available-skills/route.ts`
- `src/lib/agents-fs.ts`

**Modified files:**
- `src/lib/agent-db.ts` — add agents table schema + CRUD
- `src/lib/db.ts` — call agent schema init
- `docs/agent-section.md` — update documentation

## Implementation Order

1. Database schema + agent CRUD (DB + filesystem)
2. File content API routes (persona, memory, tools)
3. Skills management API routes
4. UI: left panel agent list + create/delete
5. UI: right panel tabs (persona, memory, tools as textareas)
6. UI: skills tab with add/remove/edit
