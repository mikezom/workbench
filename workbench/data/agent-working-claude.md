# Workbench Project — Agent Instructions

You are an autonomous coding agent executing a task in an isolated git worktree of the Workbench project. You follow a strict phased pipeline — execute one phase at a time, do NOT skip ahead.

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
│   ├── src/lib/               # Utilities: db.ts, agent-db.ts, agent-config.ts, anki-import.ts
│   ├── data/                  # SQLite DB, config files, agent skills
│   │   └── agent-skills/      # Pipeline phase skill files
│   └── scripts/               # Python daemon and executor
├── PROGRESS.md                # Task tracking
├── DETAILED_PROGRESS.md       # Session-level progress log
├── REFLECTION.md              # Mistake log
└── docs/                      # Section documentation and plans
    ├── forest-section.md
    ├── study-section.md
    ├── agent-section.md
    └── plans/
```

## Tech Stack

- **Framework**: Next.js (App Router) with TypeScript
- **Styling**: Tailwind CSS
- **Storage**: SQLite via `better-sqlite3` at `workbench/data/workbench.db`
- **Testing**: Vitest (`cd workbench && npx vitest run --reporter=verbose`)
- **FSRS**: `ts-fsrs` library for spaced repetition scheduling
- **Node.js**: v20

## Coding Conventions

- API routes go in `src/app/api/<section>/route.ts`
- Route files may ONLY export HTTP method handlers (GET, POST, PUT, DELETE) and Next.js route config. Never export helper functions from route files — extract shared logic into `src/lib/`.
- Database operations go in `src/lib/db.ts` or `src/lib/agent-db.ts`
- Shared config utilities go in `src/lib/` (e.g., `agent-config.ts`)
- Use `better-sqlite3` for all DB operations. Wrap multi-statement mutations in `db.transaction()`.
- Use Tailwind CSS for all styling. No CSS modules or styled-components.
- Co-locate tests: `src/lib/db.test.ts` next to `src/lib/db.ts`

## Git Workflow

You are already on a task branch. Commit directly to this branch.
- Do NOT create new branches
- Do NOT switch branches
- Commit format: `<type>: <description>` (feat, fix, refactor, test, docs, chore)

## Known Pitfalls

1. **Python module filenames**: Files that need to be imported must use underscores, not hyphens (e.g., `agent_executor.py`, not `agent-executor.py`).
2. **Path arithmetic**: When computing paths from `__file__`, verify the result. The Next.js app is inside `workbench/` which is inside the git repo root — that's 2+ levels of nesting.
3. **UTC vs local time**: For any time/date logic, explicitly verify whether you need UTC or local time at the point of use.
4. **Hierarchical data**: When querying groups or categories, always check whether descendant entities need to be included in aggregate queries.
5. **Transaction safety**: Multi-statement DB operations that must be atomic should be wrapped in `db.transaction()`.

## Asking Clarification Questions

If you encounter unclear requirements or multiple valid approaches, write `questions.json` to the repository root and STOP.

```json
[
  {
    "id": "q1",
    "question": "Which authentication method should I use?",
    "options": ["JWT tokens", "Session cookies", "OAuth2"]
  }
]
```

Rules:
- Each question must have a unique `id` and 2-4 `options`
- Write all questions at once
- After writing `questions.json`, stop immediately — do not write any code

## What NOT to Do

- Do not modify `CLAUDE.md` files or `agent-working-claude.md`
- Do not modify `PROGRESS.md`, `DETAILED_PROGRESS.md`, or `REFLECTION.md` — except in Phase 6 (reflection)
- Do not install new npm packages unless the task explicitly requires it
- Do not refactor code unrelated to your task
- Do not add comments, docstrings, or type annotations to code you didn't change

---

## Pipeline

**Iron Law: Execute one phase at a time. Do NOT skip ahead. Do NOT combine phases.**

Each phase is a skill file in `workbench/data/agent-skills/`. Read the skill file, execute its instructions completely, then follow its NEXT directive.

### Entry Point

Determine your starting phase:

1. **If your prompt contains "Previous Clarification Q&A"**: Phase 1 (understand) is already done. Skip directly to Phase 2.
   → Read and execute `workbench/data/agent-skills/agent-write-failing-test.md`

2. **Otherwise**: Start at Phase 1.
   → Read and execute `workbench/data/agent-skills/agent-understand-task.md`

### Pipeline Overview (for reference only — follow the skill files)

```
Phase 1: Understand Task     → agent-understand-task.md
Phase 2: Write Failing Test  → agent-write-failing-test.md      (RED)
Phase 3: Implement Minimal   → agent-implement-minimal.md       (GREEN)
Phase 4: Verify Green        → agent-verify-green.md
  ↳ incomplete? → back to Phase 2 (TDD loop)
  ↳ complete?   → Phase 5
Phase 5: Commit              → agent-commit.md
Phase 6: Reflection          → agent-reflection-after-work.md
  → DONE
```
