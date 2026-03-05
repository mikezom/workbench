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

### Phase 3g: Dark Mode Color Fixes
- [x] Replace gray-* colors with neutral-* to eliminate blue tint in dark mode
- [x] Update globals.css to use Tailwind dark mode classes instead of prefers-color-scheme
- [x] Add background colors to main element for full-page coverage
- [x] Update all sections (home, agent, forest, study) to use consistent neutral-900
- [x] Fix forest section label to use white text in dark mode
- [x] Update Start Review button to transparent with themed outline

### Phase 3h: Clipboard Section
- [x] Implement clipboard UI with create form (textarea + optional language input)
- [x] Add card-based snippet list with infinite scroll (10 items at a time)
- [x] Implement inline editing mode for snippets
- [x] Add copy to clipboard functionality with feedback
- [x] Add delete with confirmation dialog
- [x] Create clipboard-section.md documentation
- [x] Replace confirm() dialog with animated two-step button confirmation

### Phase 4: Crawl Section
- [ ] Define hardcoded sources config (HN, ArXiv, Lobste.rs, nLab, Planet Haskell)
- [x] arXiv API proxy route (`/api/crawl/arxiv`) with XML parsing
- [x] Add arXiv cache database table (`arxiv_cache` in SQLite)
- [x] Update ArxivPanel to use API route with caching
- [x] Add API route and XML parser tests
- [x] Update crawl-section.md documentation
- [ ] Build backend API for fetching and parsing web content (remaining sources)
- [ ] Create source list UI showing available sources
- [ ] Build reader-friendly content display

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
- [x] Symlink node_modules from main checkout into worktrees
- [ ] Knowledge accumulation (deferred to 5f)

#### 5f: CLAUDE.md Files for Agents
- [x] Create working agent CLAUDE.md (`data/agent-working-claude.md`)
- [x] Create task-dividing agent CLAUDE.md (`data/agent-decompose-claude.md`)
- [ ] Knowledge accumulation updates both files (deferred)

#### 5h: Skill-Based Phased Pipeline
- [x] Add vitest test framework (config, scripts)
- [x] Create 6 agent skill files (understand, write-test, implement, verify, commit, reflection)
- [x] Rewrite agent-working-claude.md as pipeline skeleton with phase routing

#### 5g: Auto-finish & Clarification Questions
- [x] Add `agent_task_questions` table and CRUD functions
- [x] Add GET/POST /api/agent/tasks/[id]/questions API route
- [x] Add merge_into_main(), questions detection, and resume_task to executor
- [x] Update daemon to handle auto-finish, questions, and resumption
- [x] Add clarification questions UI in task detail modal
- [x] Update working agent CLAUDE.md with questions.json convention
- [x] Update agent-section.md documentation

#### 5i: Decompose Feature (CLI-based)
- [x] Create 3 decompose agent skills (understand-task, breakdown-task, reflection)
- [x] Add decompose columns to agent_tasks table (parent_task_id, task_type, decompose_breakdown, etc.)
- [x] Create decompose migration script and API route
- [x] Add 4 decompose execution functions to agent_executor.py
- [x] Add 4 decompose polling functions to agent-daemon.py
- [x] Create 7 decompose API routes (create, get, answers, approve, reject, subtasks, comment)
- [x] Implement DecomposeModal component with auto-detection and high-priority popup
- [x] Create DECOMPOSE_REFLECTION.md for decompose agent learning
- [x] Rewrite agent-decompose-claude.md as pipeline with phase routing
- [x] Fix build errors (remove orphaned JSX, add status colors)

#### 5j: Agent Pipeline Fixes
- [x] Untrack CLAUDE.md from git (was polluted with decompose instructions by previous agent)
- [x] Add CLAUDE.md to .gitignore (injected dynamically at runtime)
- [x] Unify inject_claude_md(path, agent_type) replacing separate decompose-specific functions
- [x] Move decompose agent from repo root to isolated worktrees (same lifecycle as workers)
- [x] Remove dead code (cleanup_decompose_files, remove_claude_md, inject_decompose_claude_md)
- [x] Delete unneeded DECOMPOSE_IMPLEMENTATION.md and DECOMPOSE_STATUS.md
- [x] Fix decompose skill/CLAUDE.md paths from hardcoded absolute to worktree-relative
- [x] Replace DecomposeModal popup with inline decompose interactions in TaskDetailModal
- [x] Fix answered-questions UI showing form instead of "waiting for agent" message


#### 5k: Worktree Git Safety Fix
- [x] Investigate task-49 failure (agent committed to main instead of task branch)
- [x] Add branch verification to agent-commit skill (VERIFY BRANCH FIRST step)
- [x] Change absolute paths to relative paths in agent-reflection-after-work skill
- [x] Add "Git Safety in Worktrees" section to agent-working-claude.md

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
| 3g - Dark Mode Color Fixes | Complete | True neutral grays across all sections, themed button outline; `b07fb19` |
| 3h - Clipboard Section | Complete | Full UI with CRUD, infinite scroll, copy functionality, animated delete confirmation; `8ef0cc2` |
| Git Housekeeping | Complete | Fixed .gitignore, pushed 16 commits, switched remote to SSH; `c2fb702` |
| 2b - Forest Bug Fixes | Complete | graph.json path fix; `3d9e0fe` (forester-repo) |
| 4 - Crawl | In progress | ArxivPanel functional with API + caching; docs updated `325f6ad` |
| 5 - Agent | Complete (backend) | Phase 5a–5j complete (knowledge accumulation deferred); path fix `bfdbccb` |
