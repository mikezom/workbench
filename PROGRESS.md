# PROGRESS.md - Personal Workbench

## Project Overview

A personal workbench website (Next.js) with 4 sections: Agent, Forest, Study (FSRS), Crawl.

## Task Breakdown

### Phase 0: Project Setup
- [x] Initialize Next.js project with Tailwind CSS
- [x] Set up project structure (app router, components, data directory)
- [x] Initialize git repository
- [x] Extract forest.zip and integrate static files

### Phase 1: Layout & Navigation
- [x] Create main layout with sidebar/nav for 4 sections
- [x] Set up routing: `/agent`, `/forest`, `/study`, `/crawl`
- [x] Basic shared UI components (page container, nav links)

### Phase 2: Forest Section
- [x] Configure Next.js to serve `forest/output/` static files at `/forest`
- [x] Create forest landing page that loads the forester site
- [x] Verify forester JS/CSS/KaTeX rendering works

### Phase 2b: Forest Bug Fixes
- [x] Fix graph.json output path so graph panel loads (`aggregate_graph.py` in forester-repo)

### Phase 2a: Forest macOS Migration
- [x] Clone forester repo and initialize theme submodule
- [x] Install opam, forester 5.0, and watchexec on macOS
- [x] Fix symlink to `output/forest/` and update Next.js rewrites for tree page navigation
- [x] Set up fonts (Inria Sans, Source Han Sans/Serif, KaTeX)
- [x] Fix external links to open in new browser window (`target="_blank"`)
- [x] Create `start-workbench.sh` startup script (dev server + watchexec)

### Phase 3: Study Section (FSRS)
- [x] Install and integrate `ts-fsrs` library
- [x] Build JSON file storage layer for cards (`data/cards.json`)
- [x] Create card management UI (add/edit/delete cards)
- [x] Build review session UI (show due cards, rating buttons)
- [x] Implement FSRS scheduling on review
- [ ] Add "import from Forest" feature (deferred to Phase 3b)

### Phase 3a: Study Enhancements
- [x] Add hierarchical card groups with parent/child relationships
- [x] Add per-group study settings (daily new card limit, daily review limit)
- [x] Add Anki .apkg import with full template rendering
- [x] Add study log tracking for daily limit enforcement
- [x] Rewrite Study page UI with group selector, settings tab, and import

### Phase 3b: Study UI & Bug Fixes
- [x] Add cascading group delete (removes child groups and all associated cards)
- [x] Convert tab bar to sidebar layout for Review/Cards/Settings navigation
- [x] Center review cards in the main panel
- [x] Fix Anki import to create one group per .apkg (no subgroups per deck)

### Phase 3c: Study UI Improvements & Card Model
- [x] Move group selector to sidebar (below nav tabs, shared across all tabs)
- [x] Move progress info (remaining, new/review) to bottom-right of main panel
- [x] Center study card vertically and horizontally in main panel
- [x] Complete CRUD for cards (add group_id update support) and groups
- [x] Add title/definition/example card model (backward-compatible with front/back)
- [x] Structured review display: title only -> reveal definition + example
- [x] Create 10 category theory sample cards for style tuning

### Phase 3d: Study Queue System + SQLite Migration
- [x] Design queue-based review system with intra-day re-queuing
- [x] Create SQLite database layer (better-sqlite3) replacing JSON file storage
- [x] Migrate cards, groups, study_log tables to SQLite
- [x] Implement JSON → SQLite migration on first run
- [x] Add groups DB layer (CRUD, cascading delete, descendant queries)
- [x] Add cards DB layer (CRUD, bulk create, new card distribution across day-slots)
- [x] Add study log, review API with FSRS scheduling in transactions
- [x] Add session API endpoint with rollover-aware daily budget enforcement
- [x] Update Anki import to use SQLite DB functions
- [x] Rewrite ReviewTab with immediate queue, delayed cards, countdown timer
- [x] Add rollover hour setting to group settings UI
- [x] Delete old JSON storage layer (cards.ts, groups.ts, study-log.ts)
- [x] Fix descendant group budget counting, UTC→local rollover, review transaction

### Phase 3e: Study Review UX Fix
- [x] Replace delayed card queue + countdown timer with immediate requeuing

### Phase 3f: Study Scroll & Review Info
- [x] Fix scroll isolation: right panel scrolls independently, sidebars stay fixed
- [x] Display new/review card counts on Review tab before starting session
- [x] Show congratulations (no Start Review button) when no cards due

### Phase 4: Crawl Section
- [ ] Define hardcoded sources config (HN, ArXiv, Lobste.rs, nLab, Planet Haskell)
- [ ] Build backend API for fetching and parsing web content
- [ ] Create source list UI showing available sources
- [ ] Build reader-friendly content display
- [ ] Add crawl result caching in `data/crawls.json`

### Phase 5: Agent Section
Full spec: `docs/agent-section.md`

#### 5a: Database & Config
- [x] Add `agent_tasks`, `agent_task_output`, `agent_lock` tables to SQLite
- [x] Create `data/agent-config.json` config file (gitignored)
- [x] Add agent DB operations (create/read/update tasks, lock management, output logging)

#### 5b: API Routes
- [x] `GET/POST /api/agent/tasks` — list and create tasks
- [x] `GET/PUT/DELETE /api/agent/tasks/[id]` — task detail, update (cancel), delete
- [x] `GET /api/agent/tasks/[id]/output` — stream/poll execution output
- [x] `POST /api/agent/decompose` — LLM task decomposition
- [x] `GET/PUT /api/agent/config` — agent config CRUD

#### 5c: Agent UI
- [x] Prompt input area with submit button
- [x] Task board with 6 status columns (Waiting for Dev, Developing, Waiting for Review, Finished, Failed, Cancelled)
- [x] Task detail/interaction view (enlarge button on each card)
- [x] Streaming output display in detail view
- [x] Cancel button for running tasks
- [x] Config/settings panel for LLM provider, model, API key

#### 5d: Polling Daemon (Module B)
- [x] `scripts/agent-daemon.py` — polling loop with lock management
- [x] launchd plist for auto-start
- [x] Cancellation detection (check DB flag, kill subprocess)

#### 5e: Execution Pipeline (Module C)
- [x] Git worktree creation and cleanup
- [x] Claude Code CLI invocation with stream-json output
- [x] Output streaming to DB (for UI consumption)
- [x] Rebase onto main with iterative conflict resolution
- [x] Test running with iterative failure resolution
- [ ] Knowledge accumulation (deferred to 5f)

#### 5f: CLAUDE.md Files for Agents
- [x] Create working agent CLAUDE.md (`data/agent-working-claude.md`)
- [x] Create task-dividing agent CLAUDE.md (`data/agent-decompose-claude.md`)
- [ ] Knowledge accumulation updates both files (deferred)

#### 5g: Auto-finish & Clarification Questions
- [x] Add `agent_task_questions` table and CRUD functions
- [x] Add GET/POST /api/agent/tasks/[id]/questions API route
- [x] Add merge_into_main(), questions detection, and resume_task to executor
- [x] Update daemon to handle auto-finish, questions, and resumption
- [x] Add clarification questions UI in task detail modal
- [x] Update working agent CLAUDE.md with questions.json convention
- [x] Update agent-section.md documentation

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 - Setup | Complete | Commit `da39b42` |
| 1 - Layout | Complete | Commit `450adeb` |
| 2 - Forest | Complete | Commit `450adeb` |
| 2a - Forest macOS Migration | Complete | Forester repo, toolchain, fonts, link fixes; uncommitted |
| 3 - Study | Complete | Commit `7eb1f33` |
| 3a - Study Enhancements | Complete | Groups, settings, Anki import |
| 3b - Study UI & Fixes | Complete | Sidebar layout, cascading delete, import fix |
| 3c - Study UI & Card Model | Complete | Sidebar groups, centered cards, title/def/example model; UI tuning `1ae7b2e` |
| 3d - Study Queue + SQLite | Complete | Queue system, intra-day re-queuing, SQLite migration; `3bf802a` |
| 3e - Study Review UX Fix | Complete | Immediate requeue replaces delayed queue + countdown; `d71a95a` |
| 3f - Study Scroll & Review Info | Complete | Scroll isolation, review info display, zero-cards congrats; `b6a65fa` |
| Git Housekeeping | Complete | Fixed .gitignore, pushed 16 commits, switched remote to SSH; `c2fb702` |
| 2b - Forest Bug Fixes | Complete | graph.json path fix; `3d9e0fe` (forester-repo) |
| 4 - Crawl | Not started | |
| 5 - Agent | In progress | Phase 5a–5g complete (knowledge accumulation deferred) |
