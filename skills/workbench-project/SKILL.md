---
name: workbench-project
description: Personal Workbench project context and conventions. Use this skill whenever working on the workbench website project — any task involving the Next.js app, Forest section, Study/FSRS section, Crawl section, or Agent section. Also use when the user mentions workbench, forester, flashcards, FSRS, crawling, or any feature from the project. Trigger even for small changes — always orient yourself with project state before acting.
---

# Personal Workbench — Project Skill

## Mandatory Startup Checklist

Before doing ANY work on this project, complete these steps in order:

1. **Read PROGRESS.md** (`/Users/ccnas/DEVELOPMENT/workbench/PROGRESS.md`) — understand which phases are
   complete, in-progress, or not started. Only work on the current phase unless
   told otherwise.
2. **Read REFLECTION.md** (`/Users/ccnas/DEVELOPMENT/workbench/REFLECTION.md`) — review every recorded
   mistake. Do not repeat any of them. If a prevention strategy is listed,
   follow it.
3. **Read the section description** for whichever section you're working on:
   - Forest: `/Users/ccnas/DEVELOPMENT/workbench/docs/forest-section.md`
   - Study: `/Users/ccnas/DEVELOPMENT/workbench/docs/study-section.md`
   - Agent: `/Users/ccnas/DEVELOPMENT/workbench/docs/agent-section.md`
   These files contain full architecture, file inventory, data models, API reference,
   UI layout, and common pitfalls. Read the relevant one instead of exploring source files.
4. **Check the design doc** (`/Users/ccnas/DEVELOPMENT/workbench/docs/plans/2026-03-02-workbench-design.md`)
   if you need high-level architectural context beyond the section descriptions.

## Project Structure

```
/Users/ccnas/DEVELOPMENT/workbench/          # Git repo root
├── workbench/                               # Next.js project root
│   ├── src/app/                             # App Router pages
│   │   ├── layout.tsx                       # Root layout with nav
│   │   ├── page.tsx                         # Home / dashboard
│   │   ├── agent/page.tsx                   # Agent section — task management UI
│   │   ├── forest/page.tsx                  # Forest section — iframe wrapper
│   │   ├── study/page.tsx                   # Study section — full FSRS UI
│   │   ├── crawl/page.tsx                   # Crawl section (not started)
│   │   └── api/                             # API routes
│   │       ├── agent/                       # Agent task CRUD, decompose, config, output
│   │       ├── cards/                       # Card CRUD, review, session
│   │       ├── groups/                      # Group CRUD
│   │       ├── study-log/                   # Study log queries
│   │       ├── import/anki/                 # Anki .apkg import
│   │       └── migrate/                     # One-time JSON→SQLite migration
│   ├── src/components/                      # Shared: nav.tsx, page-container.tsx
│   ├── src/lib/                             # db.ts, agent-db.ts, agent-config.ts, anki-import.ts
│   ├── scripts/                             # Python daemon + executor for agent
│   │   ├── agent-daemon.py                  # Polling daemon (launchd-managed)
│   │   └── agent_executor.py                # Task execution pipeline
│   ├── public/forest/                       # Symlink → forester-repo/output/forest/
│   └── data/                                # SQLite database + agent config
│       ├── workbench.db                     # All data (cards, groups, study_log, agent_tasks)
│       ├── agent-config.json                # LLM config (gitignored)
│       ├── agent-working-claude.md          # CLAUDE.md for working agents
│       └── agent-decompose-claude.md        # System prompt for decomposition LLM
├── PROGRESS.md                              # Task tracking
├── REFLECTION.md                            # Mistake log
├── logs/                                    # Agent daemon logs
└── docs/                                    # Documentation
    ├── forest-section.md                    # Forest section technical description
    ├── study-section.md                     # Study section technical description
    ├── agent-section.md                     # Agent section technical description
    └── plans/                               # Design and implementation plans
```

Forester repo: `/Users/ccnas/DEVELOPMENT/forester-repo/` (separate git repo)

## Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Storage**: SQLite (`data/workbench.db`) via `better-sqlite3`
- **FSRS**: `ts-fsrs` library for spaced repetition scheduling
- **Agent daemon/executor**: Python 3.9+ (macOS system Python)
- **Agent CLI**: Claude Code CLI (`claude -p` with `--output-format stream-json`)
- **Node.js**: v20
- **Forester CLI**: requires `eval $(opam env)` before use

## Sections Overview

| Section | Route    | Status     | Description |
|---------|----------|------------|-------------|
| Agent   | /agent   | Complete   | Autonomous task execution via Claude Code CLI (knowledge accumulation deferred) |
| Forest  | /forest  | Complete   | Forester static site in iframe |
| Study   | /study   | Complete   | FSRS flashcards with groups, Anki import, SQLite |
| Crawl   | /crawl   | Not started | Reader for hardcoded web sources |

## Key Conventions

- **Update PROGRESS.md** after completing any task — check off items and update
  the status table.
- **Update REFLECTION.md** when you encounter and resolve an error — include the
  problem, root cause, solution, prevention strategy, and git commit ID.
- **SQLite storage** at `workbench/data/workbench.db`. Old JSON files were migrated
  and renamed to `.json.bak`. The migration endpoint (`POST /api/migrate`) is idempotent.
- **Forester output** is static XML/XSL served from `public/forest/` (symlink). Do not
  modify forester output files.
- **Agent daemon** runs via launchd (`com.workbench.agent-daemon.plist`). Use
  `launchctl load/unload` to manage. Daemon logs are in `logs/`.
- **Agent config** (`data/agent-config.json`) is gitignored — contains API keys.
- **Route file exports**: Next.js route files can only export HTTP handlers. Shared
  logic goes in `src/lib/` modules.
- **Python naming**: Importable Python files use underscores (`agent_executor.py`),
  directly-run scripts can use hyphens (`agent-daemon.py`).
- **Crawl sources** will be hardcoded in a config file, not user-editable at runtime.

## Hardcoded Crawl Sources (Phase 4 — not started)

Default sources (configured in code, editable by changing the config):
- Hacker News (front page)
- ArXiv (recent CS papers)
- Lobste.rs
- nLab (math/category theory)
- Planet Haskell
