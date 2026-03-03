---
name: workbench-project
description: Personal Workbench project context and conventions. Use this skill whenever working on the workbench website project — any task involving the Next.js app, Forest section, Study/FSRS section, Crawl section, or Agent section. Also use when the user mentions workbench, forester, flashcards, FSRS, crawling, or any feature from the project. Trigger even for small changes — always orient yourself with project state before acting.
---

# Personal Workbench — Project Skill

## Mandatory Startup Checklist

Before doing ANY work on this project, complete these steps in order:

1. **Read PROGRESS.md** (`/home/ubuntu/PROGRESS.md`) — understand which phases are
   complete, in-progress, or not started. Only work on the current phase unless
   told otherwise.
2. **Read REFLECTION.md** (`/home/ubuntu/REFLECTION.md`) — review every recorded
   mistake. Do not repeat any of them. If a prevention strategy is listed,
   follow it.
3. **Check the design doc** (`/home/ubuntu/docs/plans/2026-03-02-workbench-design.md`)
   if you need architectural context.

## Project Structure

```
/home/ubuntu/
├── workbench/                    # Next.js project root
│   ├── src/app/                  # App Router pages
│   │   ├── layout.tsx            # Root layout with nav
│   │   ├── page.tsx              # Home / dashboard
│   │   ├── agent/                # Agent section (TODO placeholder)
│   │   ├── forest/               # Forest section wrapper
│   │   ├── study/                # FSRS flashcard section
│   │   └── crawl/                # Web crawl reader section
│   ├── src/components/           # Shared React components
│   ├── src/lib/                  # Utilities, FSRS logic, data access
│   ├── public/forest/            # Extracted forester output (static)
│   └── data/                     # JSON file storage
│       ├── cards.json            # FSRS flashcard data
│       └── crawls.json           # Cached crawl results
├── forest/                       # Extracted forester source (from forest.zip)
│   ├── output/                   # Pre-built HTML/XML/JS/CSS
│   ├── trees/                    # Source tree files
│   └── theme/                    # Forester theme assets
├── forest.zip                    # Original forester archive
├── PROGRESS.md                   # Task tracking — update after completing work
├── REFLECTION.md                 # Mistake log — add entries when errors occur
└── docs/plans/                   # Design documents
    └── 2026-03-02-workbench-design.md
```

## Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Storage**: JSON files in `workbench/data/`
- **FSRS**: `ts-fsrs` library
- **Node.js**: v20

## Sections Overview

| Section | Route    | Status   | Description |
|---------|----------|----------|-------------|
| Agent   | /agent   | TODO     | Placeholder — full spec coming later |
| Forest  | /forest  | Planned  | Serve forester static site |
| Study   | /study   | Planned  | FSRS spaced repetition flashcards |
| Crawl   | /crawl   | Planned  | Reader for hardcoded web sources |

## Key Conventions

- **Update PROGRESS.md** after completing any task — check off items and update
  the status table.
- **Update REFLECTION.md** when you encounter and resolve an error — include the
  problem, root cause, solution, prevention strategy, and git commit ID.
- **JSON storage** lives in `workbench/data/`. Never use a database.
- **Forester output** is static HTML served from `public/forest/`. Do not
  modify forester output files.
- **Crawl sources** are hardcoded in a config file, not user-editable at runtime.

## FSRS Card Data Model

```json
{
  "id": "uuid",
  "front": "question (supports markdown/html)",
  "back": "answer (supports markdown/html)",
  "source": "optional forester page reference",
  "fsrs": {
    "due": "ISO date",
    "stability": 0,
    "difficulty": 0,
    "elapsed_days": 0,
    "scheduled_days": 0,
    "reps": 0,
    "lapses": 0,
    "state": 0,
    "last_review": "ISO date"
  },
  "created_at": "ISO date",
  "updated_at": "ISO date"
}
```

## Hardcoded Crawl Sources

Default sources (configured in code, editable by changing the config):
- Hacker News (front page)
- ArXiv (recent CS papers)
- Lobste.rs
- nLab (math/category theory)
- Planet Haskell
