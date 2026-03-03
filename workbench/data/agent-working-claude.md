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
