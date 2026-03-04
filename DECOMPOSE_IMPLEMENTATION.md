# Decompose Agent Implementation Summary

## Overview

Successfully implemented a complete decompose agent system that replaces SDK-based task decomposition with Claude Code CLI-based autonomous decomposition. The system uses a three-phase workflow with user interaction at key decision points.

## Implementation Status: COMPLETE (Backend + Critical UI)

### Phase 1: Skills ✓
Created three new decompose agent skills:
- `decompose-agent-understand-task` - Analyzes objective, asks clarification questions
- `decompose-agent-breakdown-task` - Creates breakdown.json with atomic sub-tasks
- `decompose-agent-reflection` - Reviews completed sub-tasks, handles false-finishes

Files:
- `/Users/ccnas/.claude/skills/decompose-agent-understand-task/skill.md`
- `/Users/ccnas/.claude/skills/decompose-agent-breakdown-task/skill.md`
- `/Users/ccnas/.claude/skills/decompose-agent-reflection/skill.md`
- `/Users/ccnas/DEVELOPMENT/workbench/DECOMPOSE_REFLECTION.md`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/data/agent-decompose-claude.md` (rewritten as pipeline)

### Phase 2: Database Schema ✓
Updated `agent_tasks` table with decompose support:
- Added `parent_task_id` - Links sub-tasks to parent decompose task
- Added `task_type` - Distinguishes 'worker' vs 'decompose' tasks
- Added `decompose_breakdown` - Stores breakdown JSON
- Added `decompose_user_comment` - Stores rejection comments
- Added `user_task_comment` - Stores user comments on completed tasks
- Added 8 new decompose statuses

Files:
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/lib/agent-db.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/lib/migrate-decompose.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/migrate-decompose/route.ts`

### Phase 3: Executor ✓
Added decompose execution functions to `agent_executor.py`:
- `execute_decompose_task()` - Phase 1 & 2 (understand + breakdown)
- `resume_decompose_task()` - Resume after user answers questions
- `retry_decompose_breakdown()` - Retry after user rejects breakdown
- `execute_decompose_reflection()` - Phase 3 (reflection on results)

Key differences from worker execution:
- No worktree (runs in main repo)
- Uses `decompose-questions.json` instead of `questions.json`
- Produces `breakdown.json` instead of code commits
- Handles reflection phase with sub-task review

Files:
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/scripts/agent_executor.py`

### Phase 4: Daemon ✓
Updated daemon to poll for decompose tasks:
- Added 4 new polling functions for decompose task states
- Integrated decompose task handling into main polling loop
- Handles all status transitions and phase routing

Files:
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/scripts/agent-daemon.py`

### Phase 5: API Routes ✓
Created/updated API routes for decompose functionality:
- `POST /api/agent/decompose` - Create decompose task
- `GET /api/agent/decompose/[id]` - Get decompose task details
- `POST /api/agent/decompose/[id]/answers` - Submit answers to questions
- `POST /api/agent/decompose/[id]/approve` - Approve breakdown, create sub-tasks
- `POST /api/agent/decompose/[id]/reject` - Reject breakdown with comments
- `GET /api/agent/decompose/[id]/subtasks` - Get all sub-tasks
- `POST /api/agent/tasks/[id]/comment` - Add comment to completed task

Files:
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/[id]/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/[id]/answers/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/[id]/approve/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/[id]/reject/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/decompose/[id]/subtasks/route.ts`
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/api/agent/tasks/[id]/comment/route.ts`

### Phase 6: Critical UI ✓
Implemented essential decompose modal component:
- High-priority popup (z-index 100, purple border)
- Auto-detects decompose tasks needing attention
- Handles all three phases:
  1. Questions display and answer submission
  2. Breakdown display with approve/reject
  3. Sub-task progress with comment functionality
- Persists until user takes action
- Filters decompose tasks from main task board

Files:
- `/Users/ccnas/DEVELOPMENT/workbench/workbench/src/app/agent/page.tsx`

## Three-Phase Workflow

### Phase 1: Planning and Clarification
1. User clicks "Decompose" → creates decompose task
2. Daemon invokes decompose agent
3. Agent runs `decompose-agent-understand-task`
4. If unclear → writes `decompose-questions.json` → popup shows questions
5. User answers → daemon re-invokes with answers
6. Agent runs `decompose-agent-breakdown-task` → writes `breakdown.json`

### Phase 2: User Confirmation and Delegation
1. Popup shows breakdown for review
2. User approves → daemon creates sub-tasks as `waiting_for_dev`
3. Or user rejects with comments → daemon re-invokes agent to retry
4. Decompose agent inactive while sub-tasks execute

### Phase 3: Review and Reflection
1. All sub-tasks complete → user comments on each (Good / Issue feedback)
2. Once all commented → daemon invokes `decompose-agent-reflection`
3. Agent reviews results:
   - All good → outputs `reflection-complete.json` → decompose task complete
   - False-finishes → outputs `reflection-retry.json` → loops back to Phase 1

## Database Migration Required

Before using the decompose feature, run the migration:

```bash
curl -X POST http://localhost:3000/api/agent/migrate-decompose
```

This adds the new columns to the `agent_tasks` table.

## Testing the Feature

1. Start the dev server: `npm run dev` (in workbench directory)
2. Start the daemon: `python3 scripts/agent-daemon.py` (or via launchd)
3. Navigate to http://localhost:3000/agent
4. Enter a complex objective and click "Decompose"
5. The decompose modal will appear automatically when the agent needs input

## Remaining UI Work (Optional Enhancements)

The core functionality is complete. Optional improvements:
- Add decompose status colors to STATUS_COLORS and STATUS_DOT constants
- Show decompose tasks in a separate section of the task board
- Add visual indicators for decompose task progress
- Improve sub-task comment UI (inline text input instead of prompt())
- Add ability to manually open decompose modal from task board

## Key Files Modified

**Backend:**
- `workbench/src/lib/agent-db.ts` - Database schema and functions
- `workbench/scripts/agent_executor.py` - Decompose execution logic
- `workbench/scripts/agent-daemon.py` - Decompose polling logic

**API:**
- `workbench/src/app/api/agent/decompose/` - 6 new route files

**Frontend:**
- `workbench/src/app/agent/page.tsx` - DecomposeModal component

**Skills:**
- `.claude/skills/decompose-agent-*` - 3 new skill files

**Documentation:**
- `DECOMPOSE_REFLECTION.md` - Decompose agent lessons learned
- `workbench/data/agent-decompose-claude.md` - Decompose pipeline

## Architecture Highlights

1. **No worktree for decompose** - Runs in main repo, cleaner and faster
2. **Separate reflection file** - Decompose agent learns independently
3. **Absolute paths throughout** - Prevents referencing errors
4. **High-priority UI** - Modal persists until user acts
5. **Three-phase separation** - Clear boundaries between planning, execution, reflection
6. **Parent-child task linking** - Sub-tasks reference parent decompose task
7. **User comments drive reflection** - Agent learns from actual outcomes

## Success Criteria Met

✓ Decompose uses Claude Code CLI instead of SDK calls
✓ Uses separate CLAUDE.md file (agent-decompose-claude.md)
✓ Has own skills (3 decompose-specific skills)
✓ Has own reflection file (DECOMPOSE_REFLECTION.md)
✓ Has own interaction loop (questions, breakdown approval, reflection)
✓ Uses decompose-questions.json (not questions.json)
✓ All paths are absolute
✓ High-priority popup for user interaction
✓ Handles all three phases correctly
