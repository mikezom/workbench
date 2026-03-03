# Phase 5f: CLAUDE.md Files for Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create CLAUDE.md instruction files for both the working agent and decompose agent, and wire them into the execution pipeline and decompose route.

**Architecture:** Two markdown files in `workbench/data/` — one copied into worktrees as `CLAUDE.md` for Claude Code auto-discovery, one loaded by the decompose API route as the system prompt. Knowledge accumulation is deferred.

**Tech Stack:** Python (executor), TypeScript/Next.js (decompose route), Markdown (content)

---

### Task 1: Create the working agent CLAUDE.md

**Files:**
- Create: `workbench/data/agent-working-claude.md`

**Step 1: Create the file**

Write `workbench/data/agent-working-claude.md` with the following content:

```markdown
# Workbench Project — Agent Instructions

You are an autonomous coding agent executing a task in an isolated git worktree of the Workbench project.

## Project Structure

```
/                              # Git repo root (you are here)
├── workbench/                 # Next.js project root
│   ├── src/app/               # App Router pages and API routes
│   │   ├── agent/page.tsx     # Agent section UI
│   │   ├── forest/page.tsx    # Forest section (iframe wrapper)
│   │   ├── study/page.tsx     # Study section (FSRS flashcards)
│   │   ├── crawl/page.tsx     # Crawl section
│   │   └── api/               # API routes
│   │       ├── agent/         # Agent task CRUD, decompose, config, output
│   │       ├── cards/         # Card CRUD, review, session
│   │       ├── groups/        # Group CRUD
│   │       ├── study-log/     # Study log queries
│   │       └── import/anki/   # Anki .apkg import
│   ├── src/components/        # Shared UI components
│   ├── src/lib/               # Utilities: db.ts, agent-config.ts, anki-import.ts
│   ├── data/                  # SQLite DB and config files
│   └── scripts/               # Python daemon and executor
├── PROGRESS.md                # Task tracking
├── REFLECTION.md              # Mistake log
└── docs/                      # Documentation and plans
```

## Tech Stack

- **Framework**: Next.js (App Router) with TypeScript
- **Styling**: Tailwind CSS
- **Storage**: SQLite via `better-sqlite3` at `workbench/data/workbench.db`
- **FSRS**: `ts-fsrs` library for spaced repetition scheduling
- **Node.js**: v20

## Coding Conventions

- API routes go in `src/app/api/<section>/route.ts`
- Route files may ONLY export HTTP method handlers (GET, POST, PUT, DELETE) and Next.js route config. Never export helper functions from route files — extract shared logic into `src/lib/`.
- Database operations go in `src/lib/db.ts` or `src/lib/agent-db.ts`
- Shared config utilities go in `src/lib/` (e.g., `agent-config.ts`)
- Use `better-sqlite3` for all DB operations. Wrap multi-statement mutations in `db.transaction()`.
- Use Tailwind CSS for all styling. No CSS modules or styled-components.

## Git Workflow

You are already on a task branch. Commit directly to this branch.
- Do NOT create new branches
- Do NOT switch branches
- Commit with clear, descriptive messages
- Keep commits focused — one logical change per commit

## Build Validation

Your changes MUST pass `npm run build` (run from `workbench/`). Fix any type errors or build failures before considering your task complete.

## Known Pitfalls

1. **Python module filenames**: Files that need to be imported must use underscores, not hyphens (e.g., `agent_executor.py`, not `agent-executor.py`).
2. **Path arithmetic**: When computing paths from `__file__`, verify the result. The Next.js app is inside `workbench/` which is inside the git repo root — that's 2+ levels of nesting.
3. **UTC vs local time**: For any time/date logic, explicitly verify whether you need UTC or local time at the point of use.
4. **Hierarchical data**: When querying groups or categories, always check whether descendant entities need to be included in aggregate queries.
5. **Transaction safety**: Multi-statement DB operations that must be atomic should be wrapped in `db.transaction()`.

## What NOT to Do

- Do not modify `CLAUDE.md` files, `PROGRESS.md`, or `REFLECTION.md`
- Do not install new npm packages unless the task explicitly requires it
- Do not refactor code unrelated to your task
- Do not add comments, docstrings, or type annotations to code you didn't change
```

**Step 2: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/data/agent-working-claude.md
git commit -m "feat(agent): add working agent CLAUDE.md instructions"
```

---

### Task 2: Create the decompose agent CLAUDE.md

**Files:**
- Create: `workbench/data/agent-decompose-claude.md`

**Step 1: Create the file**

Write `workbench/data/agent-decompose-claude.md` with the following content:

```markdown
You are a task decomposition assistant for the Workbench project. Given a user's objective, break it down into atomic, independent sub-tasks that a coding agent can execute one at a time.

## Decomposition Rules

- Each sub-task must be independently executable (no dependencies between tasks)
- Each sub-task should be small enough for a single focused coding session (30-60 min)
- Each sub-task needs a clear, specific title and a detailed prompt
- Order tasks logically (foundational changes first, UI last) but each must still work independently
- Prefer modifying existing files over creating new ones

## What Makes a Good Sub-Task Prompt

A good prompt tells the agent:
1. Exactly which files to create or modify
2. What behavior to implement, with concrete details
3. How the change fits into the existing architecture
4. Expected outcome (what should work when done)

Bad: "Add user authentication"
Good: "Create a new API route at src/app/api/auth/login/route.ts that accepts POST with {username, password}, validates against the users table in SQLite, and returns a JWT token. Use the existing db.ts for database access."

## Project Structure Knowledge

The project is a Next.js App Router application at `workbench/` inside a git repo:
- Pages: `src/app/<section>/page.tsx` (agent, forest, study, crawl)
- API routes: `src/app/api/<section>/route.ts`
- Shared libs: `src/lib/` (db.ts, agent-config.ts, anki-import.ts)
- Database: SQLite at `data/workbench.db` via better-sqlite3
- Styling: Tailwind CSS
- Python scripts: `scripts/` (agent daemon and executor)

## Output Format

Return valid JSON only — no markdown, no explanation outside the JSON.

Return a JSON array of objects with "title" and "prompt" fields:
[
  {"title": "Short task title", "prompt": "Detailed description of what to implement..."},
  ...
]
```

**Step 2: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/data/agent-decompose-claude.md
git commit -m "feat(agent): add decompose agent CLAUDE.md instructions"
```

---

### Task 3: Wire the working agent CLAUDE.md into the executor

**Files:**
- Modify: `workbench/scripts/agent_executor.py` — `execute_task()` function (line 625) and add a helper

**Step 1: Add a helper function to copy the CLAUDE.md into the worktree**

After the `create_worktree` function (around line 173), add:

```python
def inject_claude_md(worktree_path: str) -> None:
    """Copy the working agent CLAUDE.md into the worktree root.

    Claude Code auto-discovers CLAUDE.md files in the working directory.
    The source file lives at workbench/data/agent-working-claude.md in the
    worktree (since the worktree is a checkout of the repo).  We copy it
    to the worktree root so Claude Code finds it.
    """
    src = os.path.join(worktree_path, "workbench", "data", "agent-working-claude.md")
    dst = os.path.join(worktree_path, "CLAUDE.md")

    if os.path.isfile(src):
        shutil.copy2(src, dst)
        log.info("Injected CLAUDE.md into worktree from %s", src)
    else:
        log.warning("agent-working-claude.md not found at %s — skipping CLAUDE.md injection", src)
```

**Step 2: Call the helper in `execute_task()` after worktree creation**

In `execute_task()`, after the worktree info is written to the DB (after line 650), add:

```python
        # Step 1b: Inject working agent CLAUDE.md
        inject_claude_md(worktree_path)
```

**Step 3: Verify build passes**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench/workbench && npm run build
```

Expected: Build succeeds (Python files aren't part of the Next.js build, but verify nothing is broken).

**Step 4: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/scripts/agent_executor.py
git commit -m "feat(agent): inject CLAUDE.md into worktrees before Claude invocation"
```

---

### Task 4: Wire the decompose agent CLAUDE.md into the decompose route

**Files:**
- Modify: `workbench/src/app/api/agent/decompose/route.ts` (lines 23-35 — replace hardcoded systemPrompt)

**Step 1: Replace the hardcoded system prompt with file-based loading**

Replace the `systemPrompt` const (lines 23-35) with:

```typescript
import { readFileSync, existsSync } from "fs";
import path from "path";
```

Add these imports at the top of the file (after the existing imports on line 2).

Then replace the hardcoded `systemPrompt` block with:

```typescript
  const claudeMdPath = path.join(process.cwd(), "data", "agent-decompose-claude.md");
  let systemPrompt: string;
  if (existsSync(claudeMdPath)) {
    systemPrompt = readFileSync(claudeMdPath, "utf-8");
  } else {
    systemPrompt = `You are a task decomposition assistant. Given a user's objective, break it down into atomic, independent sub-tasks that a coding agent can execute one at a time.

Rules:
- Each sub-task must be independently executable (no dependencies between tasks)
- Each sub-task should be small enough for a single focused coding session
- Each sub-task needs a clear, specific title and a detailed prompt
- Return valid JSON only — no markdown, no explanation outside the JSON

Return a JSON array of objects with "title" and "prompt" fields:
[
  {"title": "Short task title", "prompt": "Detailed description of what to implement..."},
  ...
]`;
  }
```

**Step 2: Verify build passes**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench/workbench && npm run build
```

Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add workbench/src/app/api/agent/decompose/route.ts
git commit -m "feat(agent): load decompose system prompt from CLAUDE.md file"
```

---

### Task 5: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md` (lines 132-135)

**Step 1: Check off completed items**

Change lines 133-135 from:
```markdown
- [ ] Create working agent CLAUDE.md (`data/agent-working-claude.md`)
- [ ] Create task-dividing agent CLAUDE.md (`data/agent-decompose-claude.md`)
- [ ] Knowledge accumulation updates both files (with user approval for CLAUDE.md changes)
```

To:
```markdown
- [x] Create working agent CLAUDE.md (`data/agent-working-claude.md`)
- [x] Create task-dividing agent CLAUDE.md (`data/agent-decompose-claude.md`)
- [ ] Knowledge accumulation updates both files (deferred)
```

Update the status table (line 155) from:
```
| 5 - Agent | In progress | Phase 5a–5e complete; `276854e` |
```
To:
```
| 5 - Agent | In progress | Phase 5a–5f complete (knowledge accumulation deferred); `276854e` |
```

**Step 2: Commit**

```bash
cd /Users/ccnas/DEVELOPMENT/workbench
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md for phase 5f completion"
```
