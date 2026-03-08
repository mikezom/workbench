# Agent Section — Technical Description

## Overview

The Agent section provides a management interface for configurable agent definitions. Each agent is a self-contained entity with four components stored on the filesystem and indexed by SQLite. The section uses a list + detail panel layout for browsing and editing agents.

An agent consists of:
1. **Persona** — `CLAUDE.md` file defining the agent's behavior and instructions
2. **Memory** — `REFLECTION.md` file tracking the agent's learned knowledge
3. **Skills** — Per-agent copies of skill files (SKILL.md) in a `skills/` subdirectory
4. **Tools** — `mcp-config.json` in Claude Code native format for MCP server configs

## Architecture

### Data Model

The system uses a **hybrid storage model**:
- **SQLite database** — Index only (agent metadata: id, name, description, timestamps)
- **Filesystem** — Content storage at `shared-data/agent/<name>/`

This design allows agents to be self-contained directories that can be easily copied into worktrees for task execution.

### Database Schema

**Table: `agents`**

| Column      | Type    | Constraints    | Description                              |
|-------------|---------|----------------|------------------------------------------|
| id          | INTEGER | PRIMARY KEY    | Auto-incrementing agent ID               |
| name        | TEXT    | NOT NULL UNIQUE| Agent name (alphanumeric, hyphens, underscores only) |
| description | TEXT    | NULL           | Optional description of the agent        |
| created_at  | TEXT    | NOT NULL       | ISO 8601 timestamp of creation           |
| updated_at  | TEXT    | NOT NULL       | ISO 8601 timestamp of last update        |

**Indexes:** None (table is small, queries are simple)

### Filesystem Structure

Each agent lives at `shared-data/agent/<name>/`:

```
shared-data/agent/worker/
├── CLAUDE.md           # Persona: agent behavior and instructions
├── REFLECTION.md       # Memory: learned knowledge and reflections
├── skills/             # Per-agent skill copies
│   ├── agent-understand-task/
│   │   └── SKILL.md
│   └── agent-write-failing-test/
│       └── SKILL.md
└── mcp-config.json     # MCP tool configuration (Claude Code format)
```

**mcp-config.json format:**
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

## File Inventory

### Backend

- **`workbench/src/lib/agent-db.ts`** — Database layer for agents
  - `initAgentSchema(db)` — Creates agents table (called from db.ts)
  - `createAgent(name, description?)` — Insert new agent record
  - `getAgent(id)` — Fetch single agent by ID
  - `getAgentByName(name)` — Fetch single agent by name
  - `getAllAgents()` — Fetch all agents, ordered by created_at DESC
  - `updateAgent(id, updates)` — Update name and/or description
  - `deleteAgent(id)` — Delete agent record by ID

- **`workbench/src/lib/agents-fs.ts`** — Filesystem operations
  - `AGENTS_BASE_DIR` — Base directory: `shared-data/agent/`
  - `SKILL_SOURCE_DIRS` — Skill source directories to scan
  - `getAgentDir(name)` — Get path to agent directory
  - `ensureAgentDir(name)` — Create agent directory with default files
  - `removeAgentDir(name)` — Delete agent directory and contents
  - `readAgentFile(name, filename)` — Read file from agent directory
  - `writeAgentFile(name, filename, content)` — Write file to agent directory
  - `listAgentSkills(name)` — List skill directories in agent's skills/ folder
  - `addAgentSkill(name, skillName, sourceDir)` — Copy skill from source to agent
  - `removeAgentSkill(name, skillName)` — Delete skill from agent directory
  - `readAgentSkill(name, skillName)` — Read SKILL.md from agent's skill
  - `writeAgentSkill(name, skillName, content)` — Write SKILL.md to agent's skill
  - `getAvailableSkills()` — Scan source directories for available skills

### API Routes

#### Agent CRUD

- **`workbench/src/app/api/agents/route.ts`**
  - `GET /api/agents` — Returns all agents (newest first)
  - `POST /api/agents` — Creates new agent
    - Body: `{ name: string, description?: string }`
    - Validates: name must be alphanumeric/hyphens/underscores, unique
    - Creates: DB row + filesystem directory with default files
    - Returns: 201 with created agent

- **`workbench/src/app/api/agents/[id]/route.ts`**
  - `GET /api/agents/[id]` — Returns agent metadata
  - `PUT /api/agents/[id]` — Updates agent metadata
    - Body: `{ name?: string, description?: string }`
    - Validates: name format if provided
    - Returns: 200 with updated agent, or 404 if not found
  - `DELETE /api/agents/[id]` — Deletes agent
    - Removes: DB row + filesystem directory
    - Returns: 204 on success, 404 if not found

#### File Content

- **`workbench/src/app/api/agents/[id]/persona/route.ts`**
  - `GET /api/agents/[id]/persona` — Read CLAUDE.md
    - Returns: `{ content: string }`
  - `PUT /api/agents/[id]/persona` — Write CLAUDE.md
    - Body: `{ content: string }`
    - Returns: 200 with success message

- **`workbench/src/app/api/agents/[id]/memory/route.ts`**
  - `GET /api/agents/[id]/memory` — Read REFLECTION.md
    - Returns: `{ content: string }`
  - `PUT /api/agents/[id]/memory` — Write REFLECTION.md
    - Body: `{ content: string }`
    - Returns: 200 with success message

- **`workbench/src/app/api/agents/[id]/tools/route.ts`**
  - `GET /api/agents/[id]/tools` — Read mcp-config.json
    - Returns: `{ content: string }`
  - `PUT /api/agents/[id]/tools` — Write mcp-config.json
    - Body: `{ content: string }`
    - Validates: JSON format
    - Returns: 200 with success message

#### Skills Management

- **`workbench/src/app/api/agents/[id]/skills/route.ts`**
  - `GET /api/agents/[id]/skills` — List skills in agent's skills/ directory
    - Returns: `{ skills: string[] }`
  - `POST /api/agents/[id]/skills` — Add skill to agent
    - Body: `{ skillName: string, sourcePath: string }`
    - Copies: Entire skill directory from source to agent's skills/
    - Returns: 201 with success message

- **`workbench/src/app/api/agents/[id]/skills/[name]/route.ts`**
  - `GET /api/agents/[id]/skills/[name]` — Read skill's SKILL.md
    - Returns: `{ content: string }`
  - `PUT /api/agents/[id]/skills/[name]` — Update skill's SKILL.md
    - Body: `{ content: string }`
    - Returns: 200 with success message
  - `DELETE /api/agents/[id]/skills/[name]` — Remove skill from agent
    - Deletes: Entire skill directory from agent's skills/
    - Returns: 204 on success

- **`workbench/src/app/api/agents/available-skills/route.ts`**
  - `GET /api/agents/available-skills` — List available skills from source directories
    - Scans: `../skills/` and `../.claude/skills/`
    - Returns: `{ skills: [{ name: string, path: string }] }`

### Frontend

- **`workbench/src/app/agent/page.tsx`** — Main UI component
  - `AgentList` — Left panel with agent list and create form
  - `AgentDetail` — Right panel with editable header and 4 tabs
  - `FileEditor` — Reusable textarea editor for persona/memory/tools
  - `SkillsTab` — Skills list with expand/edit/add/remove functionality

## UI Layout

```
┌────────────────────┬──────────────────────────────────────────┐
│  Agent List        │  Agent Detail                            │
│  (Left Panel)      │  (Right Panel)                           │
│                    │                                          │
│  [+ New Agent]     │  Name (editable) | Description          │
│                    │  [Save] [Delete]                         │
│  > worker    (sel) │                                          │
│    decompose       │  [Persona] [Memory] [Skills] [Tools]    │
│    researcher      │                                          │
│                    │  ┌────────────────────────────────────┐ │
│                    │  │ <textarea>                         │ │
│                    │  │                                    │ │
│                    │  │  CLAUDE.md content...              │ │
│                    │  │                                    │ │
│                    │  └────────────────────────────────────┘ │
│                    │                                          │
│                    │  [Save Persona]                          │
└────────────────────┴──────────────────────────────────────────┘
```

### Left Panel — Agent List

- Scrollable list of agent names + descriptions
- "New Agent" button at top opens inline create form
- Click agent to select, highlights active agent
- Create form validates name format (alphanumeric, hyphens, underscores only)

### Right Panel — Agent Detail

**Header:**
- Editable name input (inline editing with hover border)
- Editable description input (optional)
- Save button (appears when name/description changed)
- Delete button with confirmation dialog

**Four Tabs:**

1. **Persona Tab** — Textarea editing CLAUDE.md
   - Full-height textarea with monospace font
   - Save button appears when content changes (dirty state tracking)
   - Loads content on tab open

2. **Memory Tab** — Textarea editing REFLECTION.md
   - Same behavior as Persona tab
   - Separate dirty state tracking

3. **Skills Tab** — List of current skills with management
   - "Add Skill" button opens picker showing available skills
   - Each skill is expandable (click to expand/collapse)
   - Expanded skill shows textarea editor for SKILL.md
   - Save button appears when skill content changes
   - Remove button per skill with confirmation
   - Picker filters out already-added skills

4. **Tools Tab** — Textarea editing mcp-config.json
   - Same behavior as Persona/Memory tabs
   - JSON validation on save
   - Shows error if invalid JSON

## Features

### 1. Create Agent
- Click "New Agent" button in left panel
- Inline form appears with name and description inputs
- Name validation: alphanumeric, hyphens, underscores only
- Uniqueness check: name must not already exist
- Creates DB row + filesystem directory with default files
- New agent appears at top of list

### 2. View Agents
- Left panel shows all agents ordered by creation date (newest first)
- Each agent shows name and description (if present)
- Click to select, right panel updates to show details
- Selected agent highlighted in list

### 3. Edit Agent Metadata
- Name and description editable inline in header
- Save button appears when changes detected
- Name validation enforced
- Updates DB record and triggers list refresh

### 4. Delete Agent
- Delete button in header with confirmation dialog
- Removes DB row + filesystem directory
- Selection cleared, list refreshed

### 5. Edit Persona/Memory/Tools
- Tab-based interface for file content
- Full-height textarea with monospace font
- Dirty state tracking (save button only appears when changed)
- Content loaded on tab open
- Save writes to filesystem

### 6. Manage Skills
- List view of current skills
- Expandable to view/edit SKILL.md content
- Add skill from picker (scans source directories)
- Remove skill with confirmation
- Edit skill content inline with dirty state tracking

## Data Flow

### Create Agent Flow
```
User clicks "New Agent" → Inline form → Submit
  → POST /api/agents → createAgent() + ensureAgentDir()
  → INSERT INTO agents + mkdir + create default files
  → Return new agent → Refresh list → Display at top
```

### Update Metadata Flow
```
User edits name/description → Save button appears → Click Save
  → PUT /api/agents/[id] → updateAgent()
  → UPDATE agents SET name, description, updated_at
  → Return updated agent → Refresh list
```

### Delete Agent Flow
```
User clicks Delete → Confirmation dialog → Confirm
  → DELETE /api/agents/[id] → deleteAgent() + removeAgentDir()
  → DELETE FROM agents + rm -rf directory
  → 204 response → Clear selection → Refresh list
```

### Edit File Content Flow
```
User switches to tab → Load content
  → GET /api/agents/[id]/{persona|memory|tools}
  → readAgentFile() → Return content → Display in textarea
User edits → Save button appears → Click Save
  → PUT /api/agents/[id]/{persona|memory|tools}
  → writeAgentFile() → Write to disk → 200 response
  → Update saved state (hide save button)
```

### Add Skill Flow
```
User clicks "Add Skill" → Picker opens
  → GET /api/agents/available-skills → getAvailableSkills()
  → Scan source directories → Return list → Display in picker
User clicks skill → POST /api/agents/[id]/skills
  → addAgentSkill() → Copy skill directory → 201 response
  → Close picker → Refresh skills list
```

### Edit Skill Flow
```
User clicks skill to expand → Load content
  → GET /api/agents/[id]/skills/[name] → readAgentSkill()
  → Return SKILL.md content → Display in textarea
User edits → Save button appears → Click Save
  → PUT /api/agents/[id]/skills/[name] → writeAgentSkill()
  → Write to disk → 200 response → Update saved state
```

### Remove Skill Flow
```
User clicks Remove → Confirmation dialog → Confirm
  → DELETE /api/agents/[id]/skills/[name] → removeAgentSkill()
  → rm -rf skill directory → 204 response
  → Collapse if expanded → Refresh skills list
```

## Integration Points

### Database
- Uses shared SQLite connection from `workbench/src/lib/db.ts`
- Schema initialization: Called from `getDb()` via `initAgentSchema()`
- Agents table coexists with agent_tasks table

### Agentic Tasks Integration
- The `agent_tasks` table has an `agent_id` column (not yet implemented in UI)
- Future: Tasks can be linked to specific agents
- Agent executor can look up agent directory by ID/name
- Agent's persona, memory, skills, and tools can be copied into worktrees

### Agent Executor Integration
- Agent executor (`workbench/scripts/agent_executor.py`) can be updated to:
  1. Look up agent directory from `shared-data/agent/<name>/`
  2. Copy `CLAUDE.md` into worktree as persona
  3. Copy `skills/` into worktree's skills directory
  4. Copy `mcp-config.json` into worktree's Claude config
  5. After task completion, copy updated `REFLECTION.md` back to agent directory

### Navigation
- Listed in `workbench/src/components/nav.tsx` as "Agent"
- Route: `/agent`

### Styling
- Uses Tailwind CSS with neutral color scheme matching other sections
- Respects light/dark mode via Tailwind dark: classes
- Split-panel layout with fixed left panel (256px) and flexible right panel

## Common Pitfalls

1. **Name validation**: Agent names must be alphanumeric with hyphens and underscores only. This ensures filesystem compatibility and prevents path traversal issues.

2. **Filesystem sync**: Creating an agent creates both a DB row and a filesystem directory. Deleting removes both. If the filesystem operation fails, the DB operation should be rolled back (not currently implemented).

3. **Dirty state tracking**: Each tab (Persona, Memory, Tools) and each expanded skill tracks its own dirty state independently. Switching tabs does not lose unsaved changes because each tab is keyed by agent ID.

4. **Skill copying**: Adding a skill copies the entire skill directory, not just SKILL.md. This allows skills to have additional files (e.g., templates, configs).

5. **JSON validation**: The Tools tab validates JSON format on save. Invalid JSON shows an error and prevents saving.

6. **Agent name changes**: Updating an agent's name in the DB does NOT rename the filesystem directory. This is a known limitation. To rename an agent, you must delete and recreate it.

7. **Concurrent edits**: No locking mechanism prevents concurrent edits to the same agent from different sessions. Last write wins.

## Future Enhancements (Not Implemented)

- **Agent-task linking**: UI for assigning agents to tasks (agent_id column exists but not used)
- **Agent templates**: Predefined agent templates for common use cases
- **Skill versioning**: Track skill versions and allow rollback
- **Agent cloning**: Duplicate an agent with all its configuration
- **Bulk operations**: Import/export agents as archives
- **Agent metrics**: Track agent performance and success rates
- **Filesystem-DB sync**: Automatic reconciliation if DB and filesystem get out of sync
- **Agent name rename**: Rename filesystem directory when agent name changes

## Testing

No automated tests currently exist for the Agent section. Manual testing should cover:

- Create agent with valid/invalid names
- Update agent metadata
- Delete agent and verify filesystem cleanup
- Edit persona/memory/tools and verify file writes
- Add/remove/edit skills
- JSON validation in Tools tab
- Dirty state tracking across tabs
- Concurrent agent selection

## Key Files Summary

**Backend:**
- `workbench/src/lib/agent-db.ts` — Database CRUD operations
- `workbench/src/lib/agents-fs.ts` — Filesystem operations

**API Routes:**
- `workbench/src/app/api/agents/route.ts` — List/create agents
- `workbench/src/app/api/agents/[id]/route.ts` — Get/update/delete agent
- `workbench/src/app/api/agents/[id]/persona/route.ts` — Read/write CLAUDE.md
- `workbench/src/app/api/agents/[id]/memory/route.ts` — Read/write REFLECTION.md
- `workbench/src/app/api/agents/[id]/tools/route.ts` — Read/write mcp-config.json
- `workbench/src/app/api/agents/[id]/skills/route.ts` — List/add skills
- `workbench/src/app/api/agents/[id]/skills/[name]/route.ts` — Get/update/delete skill
- `workbench/src/app/api/agents/available-skills/route.ts` — List available skills

**Frontend:**
- `workbench/src/app/agent/page.tsx` — Main UI component
