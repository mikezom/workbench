# Workbench Project — Agent Instructions

You are an autonomous coding agent executing a task in an isolated git worktree of the Workbench project. You follow a strict phased pipeline — execute one phase at a time, do NOT skip ahead.

## CRITICAL: Asking Clarification Questions

**If you encounter unclear requirements or multiple valid approaches, you MUST write `questions.json` to the repository root and STOP immediately.**

```json
[
  {
    "id": "q1",
    "question": "Which authentication method should I use?",
    "options": ["JWT tokens", "Session cookies", "OAuth2"]
  },
  {
    "id": "q2",
    "question": "Should this feature work on mobile devices?",
    "options": ["Yes, mobile-first", "Desktop only", "Both with responsive design"]
  }
]
```

**Rules:**
- Each question must have a unique `id` and 2-4 `options`
- Write all questions at once in a single file
- After writing `questions.json`, STOP immediately — do NOT write any code, do NOT commit anything
- Do NOT ask questions in your output text — only via questions.json
- The executor will detect questions.json, transition the task to "waiting_for_review", and present the questions to the user in the UI
- After the user answers, you will be resumed with the answers in your prompt

**This is the ONLY way to ask questions. Do not use any other method.**

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
│   ├── data/                  # SQLite DB and config files
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

## ⚠️ CRITICAL: Git Safety in Worktrees

**You are executing in a git worktree.** The Skill tool may temporarily change the working directory when loading skills. This can cause git commands to run in the wrong repository.

**ALWAYS follow these rules:**

1. **Verify branch before ANY git commit operation:**
   ```bash
   git branch --show-current
   ```
   - Expected output: `task/<something>` (e.g., `task/add-login-feature`)
   - If output is `main` or `master`: **STOP immediately** — you are in the wrong directory
   - Do NOT proceed with `git add` or `git commit` until you verify you're on a task branch

2. **Use RELATIVE paths for git operations:**
   - ✅ Correct: `git add workbench/src/lib/db.ts`
   - ❌ Wrong: `git add /Users/ccnas/DEVELOPMENT/workbench/workbench/src/lib/db.ts`

3. **Use RELATIVE paths for file edits:**
   - ✅ Correct: Read/Edit `PROGRESS.md`
   - ❌ Wrong: Read/Edit `/Users/ccnas/DEVELOPMENT/workbench/PROGRESS.md`

4. **After loading a skill, verify your branch:**
   The first git command after a skill loads may run in the wrong directory. Always run `git branch --show-current` first.

## Known Pitfalls

1. **Python module filenames**: Files that need to be imported must use underscores, not hyphens (e.g., `agent_executor.py`, not `agent-executor.py`).
2. **Path arithmetic**: When computing paths from `__file__`, verify the result. The Next.js app is inside `workbench/` which is inside the git repo root — that's 2+ levels of nesting.
3. **UTC vs local time**: For any time/date logic, explicitly verify whether you need UTC or local time at the point of use.
4. **Hierarchical data**: When querying groups or categories, always check whether descendant entities need to be included in aggregate queries.
5. **Transaction safety**: Multi-statement DB operations that must be atomic should be wrapped in `db.transaction()`.

## What NOT to Do

- Do not modify `CLAUDE.md` files or `agent-working-claude.md`
- Do not modify `PROGRESS.md`, `DETAILED_PROGRESS.md`, or `REFLECTION.md` — except in Phase 6 (reflection)
- Do not install new npm packages unless the task explicitly requires it
- Do not refactor code unrelated to your task
- Do not add comments, docstrings, or type annotations to code you didn't change
- **Do not ask questions in your output text** — use questions.json (see above)
- **Do not use absolute paths** — always use relative paths from the worktree root

---

## Pipeline

**Iron Law: Execute one phase at a time. Do NOT skip ahead. Do NOT combine phases.**

Each phase is a skill. Use the Skill tool to invoke each phase, execute its instructions completely, then follow its NEXT directive.

### Entry Point

Determine your starting phase:

1. **If your prompt contains "Previous Clarification Q&A"**: Phase 1 (understand) is already done. Skip directly to Phase 2.
   → Use the Skill tool to invoke `agent-write-failing-test`

2. **Otherwise**: Start at Phase 1.
   → Use the Skill tool to invoke `agent-understand-task`

### Pipeline Overview (for reference only — follow the skill instructions)

```
Phase 1: Understand Task     → agent-understand-task
Phase 2: Write Failing Test  → agent-write-failing-test           (RED)
Phase 3: Implement Minimal   → agent-implement-minimal            (GREEN)
Phase 4: Verify Green        → agent-verify-green
  ↳ incomplete? → back to Phase 2 (TDD loop)
  ↳ complete?   → Phase 5
Phase 5: Commit              → agent-commit
Phase 6: Reflection          → agent-reflection-after-work
  → DONE
```
