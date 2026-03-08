# Agent Section Design Document

**Date**: 2026-03-08
**Status**: Approved

## Overview

The Agent section provides a management interface for agent definitions in the workbench. Users can create, view, edit, and delete agents, where each agent consists of four components: Persona (CLAUDE.md), Memory (REFLECTION.md), Skills (file-based references), and Tools (MCP tool configurations). The section also displays task history and statistics for each agent.

## Goals

- Provide CRUD operations for agent definitions
- Manage agent persona, memory, skills, and tools
- Link agents to their task history
- Support file-based skills storage in shared directory
- Maintain consistency with existing workbench architecture

## Non-Goals

- Running agent tasks (handled by agentic-tasks section)
- Real-time agent execution monitoring
- Skill creation/editing (skills are managed as files)
- Advanced workflow orchestration

## Architecture

### Data Model

**Storage Strategy**:
- Agent metadata, persona, memory, and tools: SQLite database
- Skills: File-based references to `DEVELOPMENT/shared-data/skills/`
- Task history: Linked via `agent_tasks.agent_id` foreign key

**Database Schema**:

```sql
-- Agents table
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  persona TEXT NOT NULL DEFAULT '',
  memory TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent skills (references to skill folders)
CREATE TABLE agent_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Agent tools (MCP tool configurations)
CREATE TABLE agent_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Link to existing agent_tasks
ALTER TABLE agent_tasks ADD COLUMN agent_id INTEGER REFERENCES agents(id);

-- Indexes
CREATE INDEX idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id);
```

**TypeScript Interfaces**:

```typescript
interface Agent {
  id: number;
  name: string;
  description: string | null;
  persona: string;
  memory: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentSkill {
  id: number;
  agent_id: number;
  skill_name: string;
  order_index: number;
}

interface AgentTool {
  id: number;
  agent_id: number;
  name: string;
  config: string;
  order_index: number;
}
```

### File System Structure

```
DEVELOPMENT/
  shared-data/
    skills/
      skill-1/
        SKILL.md
        script.sh
        config.json
      skill-2/
        SKILL.md
        helper.py
  workbench/
    workbench/
      data/
        workbench.db
```

## Component Structure

### Page Layout

Following the Study section pattern:

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (w-48)        │  Main Panel (flex-1)       │
│                        │                             │
│  Agent                 │  Agent Details              │
│                        │                             │
│  + New Agent           │  Tabs:                      │
│                        │  - Overview                 │
│  ┌──────────────┐      │  - Persona                  │
│  │ Agent 1      │      │  - Memory                   │
│  └──────────────┘      │  - Skills                   │
│  ┌──────────────┐      │  - Tools                    │
│  │ Agent 2      │      │  - Tasks                    │
│  └──────────────┘      │                             │
│  ┌──────────────┐      │  [Tab Content]              │
│  │ Agent 3      │      │                             │
│  └──────────────┘      │                             │
└─────────────────────────────────────────────────────┘
```

### Tab Components

**1. Overview Tab**
- Display: name, description, created/updated dates
- Edit mode: text inputs for name and description

**2. Persona Tab**
- Display: CLAUDE.md content
- Edit mode: large textarea for editing persona
- View mode: formatted markdown display

**3. Memory Tab**
- Display: REFLECTION.md content with last updated timestamp
- Edit mode: textarea with warning about auto-updates
- Note: Memory is auto-updated by agents after tasks, but can be manually overridden

**4. Skills Tab**
- Display: List of assigned skills with preview
- Edit mode: Multi-select from available skills (scanned from file system)
- Shows skill name + preview of SKILL.md content
- Reorder controls (up/down arrows)

**5. Tools Tab**
- Display: List of tools with name and config preview
- Edit mode: Add/edit/delete tools
- Each tool: name field + JSON config textarea
- Reorder controls

**6. Tasks Tab**
- Display: Statistics (total tasks, success rate, last run date)
- Recent tasks list (last 10) with status and date
- Link to agentic-tasks section for full details

### View/Edit Mode

- **View mode**: All tabs show read-only content with "Edit" button in header
- **Edit mode**: Fields become editable, "Save" and "Cancel" buttons appear
- Edit mode is per-agent (not per-tab)
- Unsaved changes warning when switching agents or leaving page

## API Routes

### Agent CRUD

```typescript
GET    /api/agents              // List all agents
POST   /api/agents              // Create agent
GET    /api/agents/[id]         // Get agent details
PUT    /api/agents/[id]         // Update agent
DELETE /api/agents/[id]         // Delete agent
```

### Skills Management

```typescript
GET /api/agents/[id]/skills
// Returns: { assigned: AgentSkill[], available: string[] }

PUT /api/agents/[id]/skills
// Body: { skills: string[] }
// Returns: AgentSkill[]

GET /api/skills/[skillName]
// Returns: { name: string, content: string }
```

### Tools Management

```typescript
GET    /api/agents/[id]/tools           // List tools
POST   /api/agents/[id]/tools           // Create tool
PUT    /api/agents/[id]/tools/[toolId]  // Update tool
DELETE /api/agents/[id]/tools/[toolId]  // Delete tool
PUT    /api/agents/[id]/tools/reorder   // Reorder tools
```

### Task History

```typescript
GET /api/agents/[id]/tasks
// Returns: {
//   statistics: {
//     total: number,
//     finished: number,
//     failed: number,
//     successRate: number,
//     lastRunAt: string | null
//   },
//   recentTasks: AgentTask[]
// }
```

## Data Flow

### Loading an Agent

1. Frontend: `GET /api/agents/[id]` → Agent data
2. Frontend: `GET /api/agents/[id]/skills` → Skills (assigned + available)
3. Frontend: `GET /api/agents/[id]/tools` → Tools list
4. Frontend: `GET /api/agents/[id]/tasks` → Task statistics

### Editing an Agent

1. User clicks "Edit" → enters edit mode
2. User modifies fields (persona, memory, skills, tools)
3. User clicks "Save" → `PUT /api/agents/[id]` with updated data
4. Backend validates and saves to database
5. Frontend refreshes agent data and exits edit mode

### Skills Workflow

1. Backend scans `DEVELOPMENT/shared-data/skills/` for available skills
2. Frontend shows checkboxes for available skills
3. User selects/deselects skills
4. On save: `PUT /api/agents/[id]/skills` with array of skill names
5. Backend updates `agent_skills` table with new assignments

## Implementation Details

### Database Functions (agent-db.ts)

**Agent operations**:
- `createAgent(data)` - Create new agent
- `getAgent(id)` - Get single agent
- `getAllAgents()` - List all agents
- `updateAgent(id, updates)` - Update agent
- `deleteAgent(id)` - Delete agent (cascades)

**Skills operations**:
- `getAgentSkills(agentId)` - Get agent's skills
- `setAgentSkills(agentId, skillNames)` - Replace all skills
- `getAvailableSkills()` - Scan file system for skills

**Tools operations**:
- `getAgentTools(agentId)` - Get agent's tools
- `createAgentTool(data)` - Create tool
- `updateAgentTool(id, updates)` - Update tool
- `deleteAgentTool(id)` - Delete tool
- `reorderAgentTools(agentId, toolIds)` - Reorder tools

**Task statistics**:
- `getAgentTaskStatistics(agentId)` - Calculate statistics
- `getAgentRecentTasks(agentId, limit)` - Get recent tasks

### File System Operations

```typescript
// skills-fs.ts or in agent-db.ts

const SKILLS_DIR = path.join(
  process.cwd(), '..', '..', 'shared-data', 'skills'
);

// Get list of skill folder names
function getAvailableSkills(): string[]

// Read SKILL.md content for preview
function getSkillContent(skillName: string): string | null
```

### Error Handling

**Database errors**:
- Wrap all DB operations in try-catch
- Return null for not found (GET operations)
- Return false for failed deletions
- Throw descriptive errors for constraint violations

**File system errors**:
- Check if skills directory exists before scanning
- Handle missing SKILL.md files gracefully
- Log warnings for inaccessible skill folders

**API error responses**:
- 400 Bad Request: Invalid input
- 404 Not Found: Resource doesn't exist
- 500 Internal Server Error: Unexpected errors

**Frontend error handling**:
- Show toast/alert for API errors
- Disable save button during submission
- Preserve form state on error
- Clear error state on successful save

## Testing Strategy

### Database Layer Tests
- CRUD operations for agents
- Skills assignment and retrieval
- Tools CRUD and reordering
- Task statistics calculation
- Cascade deletion

### API Route Tests
- Test each endpoint with valid/invalid inputs
- Test error cases (not found, validation errors)
- Test file system operations

### Component Tests
- Test tab switching
- Test view/edit mode toggle
- Test form validation
- Test unsaved changes warning

## Implementation Order

### Phase 1: Database & API Foundation
1. Update `agent-db.ts` with new schema and functions
2. Create migration to add new tables
3. Implement agent CRUD API routes
4. Test database layer

### Phase 2: Skills & Tools APIs
1. Implement file system scanning for skills
2. Create skills API routes
3. Create tools API routes
4. Test API endpoints

### Phase 3: Basic UI
1. Create agent page with sidebar + main panel layout
2. Implement agent list in sidebar
3. Implement Overview tab (view mode only)
4. Test basic navigation

### Phase 4: Content Tabs
1. Implement Persona tab (view + edit)
2. Implement Memory tab (view + edit)
3. Implement Skills tab (view + edit with file system integration)
4. Implement Tools tab (view + edit with list management)
5. Test all tabs

### Phase 5: Task Integration
1. Implement Tasks tab with statistics
2. Link to agentic-tasks section
3. Test task history display

### Phase 6: Polish
1. Add unsaved changes warning
2. Add loading states
3. Add error handling and user feedback
4. Final testing and bug fixes

## Files to Create/Modify

**New files**:
- `src/app/agent/page.tsx`
- `src/app/api/agents/route.ts`
- `src/app/api/agents/[id]/route.ts`
- `src/app/api/agents/[id]/skills/route.ts`
- `src/app/api/agents/[id]/tools/route.ts`
- `src/app/api/agents/[id]/tools/[toolId]/route.ts`
- `src/app/api/agents/[id]/tasks/route.ts`
- `src/app/api/skills/[skillName]/route.ts`
- `src/lib/skills-fs.ts`

**Modified files**:
- `src/lib/agent-db.ts`
- `src/lib/db.ts`

## Future Enhancements

- Rich text editor for persona/memory (Monaco/CodeMirror)
- Skill versioning and history
- Agent templates/cloning
- Export/import agent definitions
- Agent performance analytics
- Skill dependency management
