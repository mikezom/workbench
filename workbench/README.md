# Workbench

Workbench is a personal Next.js application that combines several tools behind one shell:

- Home dashboard with text posts and uploaded images
- Agent definitions and agentic task execution
- Monitor views for active tasks, queue state, and investigation reports
- Study and Tutor interfaces
- Crawl panels for external content sources
- Quant strategy and backtest tooling
- Clipboard snippets
- Forest embedding for the external `forester-repo`

## Repo Layout

The git repository root is `../`, not this folder.

```text
workbench/
  docs/                 section documentation and implementation plans
  logs/                 daemon / automation logs
  skills/               local skill sources
  .worktrees/           task worktrees created by the agent system
  workbench/            this Next.js app
```

The application code lives here:

- `src/app` — pages and API routes
- `src/components` — UI components
- `src/lib` — SQLite access, parsers, filesystem helpers, and domain logic
- `scripts` — Python and shell helpers for daemon, quant, backup, and data refresh jobs
- `data/workbench.db` — primary SQLite database

## Data and Integrations

- Main app state is stored in `data/workbench.db`.
- Home images are stored in `../../shared-data/images/`.
- Agent files live in `../../shared-data/agent/`.
- Tutor avatars live in `../../shared-data/avatars/`.
- Quant market data is read from a separate Tushare database under shared data.
- Forest content is not authored in this repo. The `/forest` route serves prebuilt output from `/Users/ccnas/DEVELOPMENT/forester-repo/output/forest/`.

## Running Locally

From this directory:

```bash
npm run dev
```

The dev server listens on `http://localhost:5090`.

From `/Users/ccnas/DEVELOPMENT`, you can also use:

```bash
./start-workbench.sh
```

That script starts the Next.js dev server, runs an initial Forester build in `forester-repo`, and watches tree files for rebuilds.

## Section Docs

Current section docs live in `../docs/`:

- `home-section.md`
- `agent-section.md`
- `agentic-tasks-section.md`
- `monitor-section.md`
- `study-section.md`
- `interactive-study-section.md`
- `crawl-section.md`
- `quant-section.md`
- `clipboard-section.md`
- `forest-section.md`

Historical design and implementation notes remain under `../docs/plans/`.
