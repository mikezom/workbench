# PROGRESS.md - Personal Workbench

## Project Overview

A personal workbench website (Next.js) with 9 sections: Home, Agentic Tasks, Monitor, Agent, Forest, Study (FSRS), Tutor, Crawl, Clipboard, and Quant.

## Task Breakdown

### Phase 0: Project Setup
- [x] Initialize Next.js project with Tailwind CSS
- [x] Set up project structure (app router, components, data directory)
- [x] Initialize git repository
- [x] Extract forest.zip and integrate static files

### Phase 1: Layout & Navigation
- [x] Create main layout with sidebar/nav for all sections
- [x] Set up routing: `/`, `/agentic-tasks`, `/monitor`, `/agent`, `/forest`, `/study`, `/crawl`, `/clipboard`
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

### Phase 3i: Test Database Isolation
- [x] Design solution for test database isolation (prevent tests from wiping production data)
- [x] Modify getDb() to detect test environment and use in-memory SQLite database
- [x] Verify all database tests pass with in-memory database
- [x] Confirm production database remains intact during test runs

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

### Phase 5: Agentic Tasks Section
Full spec: `docs/agentic-tasks-section.md`

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

### Phase 6: Crawl Section
- [x] arXiv panel with search UI (mock data)
- [x] arXiv cache database schema and functions
- [x] arXiv API proxy route with XML parsing
- [x] arXiv panel connected to API route
- [x] Update crawl-section.md documentation
- [x] Update PROGRESS.md with arXiv items
- [x] Fix arXiv panel height and add custom scrollbar
- [x] Auto-fetch recent papers on mount with sort by submitted date
- [x] Jin10 News panel implementation (database, parser, API, UI)
- [x] Jin10 Puppeteer scraper for JavaScript-rendered content
- [x] Jin10 timestamp display fix (GMT+8 time-of-day)
- [x] SOLIDOT panel implementation (database, parser, API, UI)
- [ ] nLab panel implementation
- [ ] Planet Haskell panel implementation
- [ ] Reddit panel implementation

### Phase 7: Home Section Image Storage Migration
- [x] Create image serving API route at /api/home/images/[filename]
- [x] Add security validations (path traversal, file size, magic bytes)
- [x] Update upload route to save to data/images/ instead of public/uploads/
- [x] Update .gitignore to exclude data/images/
- [x] Remove old public/uploads/ directory
- [x] Create home-section.md documentation
- [x] Fix test isolation and dark mode test expectations

### Phase 7h: Home Expand Modal
- [x] Create ImageModal component with conditional layout
- [x] Add expand button to post cards (visible on hover)
- [x] Implement three close methods (X button, ESC, background click)
- [x] Add responsive behavior (vertical stack on mobile)
- [x] Test all interactions and edge cases

### Phase 8: Mobile Responsive Navigation
- [x] Design portrait-responsive navigation (design doc + implementation plan)
- [x] Add custom Tailwind portrait breakpoint (orientation: portrait)
- [x] Update root layout for portrait mode (flex-col stacking, bottom padding)
- [x] Add icon data to navigation sections
- [x] Transform nav container to fixed bottom bar on portrait
- [x] Hide branding and theme toggle on portrait
- [x] Make nav items container portrait-responsive (horizontal layout)
- [x] Render icons in navigation links with portrait styling
- [x] Refine spacing and height for mobile (even distribution, compact)
- [x] Implement liquid-glass design (backdrop blur, transparency, Heroicons, blue glow)

### Phase 9: Monitor Section & Daemon Refactor
Full spec: `docs/monitor-section.md`

- [x] Refactor agent-daemon.py with TaskHandler ABC registry pattern (614 → 284 lines)
- [x] Add monitor database schema (agent_monitoring, investigation_reports, agent_activity_log)
- [x] Extend agent_tasks task_type to include 'investigation'
- [x] Create database migration route for existing databases
- [x] Add investigation task handler and executor pipeline
- [x] Build monitor API routes (active agents, queue, terminate, activity)
- [x] Build investigation API routes (create, list reports, get report)
- [x] Create /monitor page with 3 tabs (Active Agents, Task Queue, Reports)
- [x] Add investigation form and report viewer to Reports tab
- [x] Wire initMonitorSchema into database initialization
- [ ] Wire monitoring service into executors (process tracking, activity logging)

### Phase 10: Documentation & Architecture Updates
- [x] Rename Agent section to Agentic Tasks
- [x] Update all routes from /agent to /agentic-tasks
- [x] Update all API routes from /api/agent to /api/agentic-tasks
- [x] Create placeholder Agent section at /agent (top-level)
- [x] Create monitor-section.md documentation
- [x] Create agent-section.md documentation (placeholder section)
- [x] Update agentic-tasks-section.md with new routes
- [x] Update PROGRESS.md to reflect current architecture

### Phase 11: Interactive Study Section
Full spec: `docs/plans/2026-03-08-interactive-study-design.md`
Implementation plan: `docs/plans/2026-03-08-interactive-study-impl.md`

#### 11a: Backend (Tasks 1-7)
- [x] Install KaTeX dependency
- [x] Add `interactive-study` task type to database schema with migration
- [x] Exclude `interactive-study` from worker handler
- [x] Create interactive-study executor function
- [x] Create interactive-study task handler and register in daemon
- [x] Create agent config files (CLAUDE.md + config.json)
- [x] API routes for session CRUD and messages

#### 11b: Frontend (Tasks 8-13)
- [x] LaTeX renderer component with KaTeX (inline/block math, markdown)
- [x] MessageBubble component (user/assistant variants, avatars)
- [x] ChatInterface component (auto-scroll, typing indicator, input)
- [x] SessionSidebar component (session list, status dots, delete)
- [x] Interactive Study page with session management and polling
- [x] Add Tutor to navigation sidebar
- [x] Build verification and smoke test

### Phase 11c: Interactive Study Bug Fixes
- [x] Fix worktree-per-message bug (create once per session, reuse for subsequent messages)
- [x] Change idle status from `waiting_for_dev` to `waiting_for_review` to prevent handler conflicts
- [x] Add guard in execute_task to reject non-worker task types
- [x] Kill stale daemon processes and clean up orphaned worktrees

### Phase 11d: Interactive Study End Session Feature
- [x] Add "End Session" button to ChatInterface
- [x] Update PUT endpoint to allow status='finished' transition
- [x] Show "Session ended" message when session is finished
- [x] Display checkmark icon for finished sessions in SessionSidebar
- [x] Fix unused error variables in API routes and test files

### Phase 11e: Interactive Study Agent Context Fix
- [x] Add inject_agent_context() to copy memory and skills into worktree
- [x] Update execute_interactive_study() to inject complete agent context
- [x] Fix bug where agent couldn't access REFLECTION.md or skills

### Phase 11f: Interactive Study Session Finish Flow
- [x] Add InteractiveStudyFinishHandler to detect finished sessions
- [x] Add finish_interactive_study_session() executor function
- [x] Auto-invoke record-progress skill when session ends
- [x] Copy updated REFLECTION.md back to agent data folder
- [x] Clean up worktree and branch after session completion
- [x] Fix record-progress skill to use worktree memory path (no commit)
- [x] Simplify memory path to .claude/MEMORY.md
- [x] Update interactive-study-cat-theory skill for new memory path

### Phase 11g: Interactive Study Message Display Fix
- [x] Fix message limit bug (100 message default caused messages to disappear)
- [x] Increase limit to 10000 for interactive study sessions

### Phase 11h: Interactive Study Progress Recording Fix
- [x] Pass task_id in prompt when ending session
- [x] Update record-progress skill to load conversation from database

### Phase 11j: Interactive Study Session Resume Fix
- [x] Fix CLI session resume (--resume flag) for conversation continuity
- [x] Extract session_id from init events for subsequent turns
- [x] Update finish handler to resume session when recording progress

### Phase 11i: Interactive Study Virtual Scrolling
- [x] Install react-virtuoso for efficient message rendering
- [x] Replace manual scrolling with Virtuoso component
- [x] Move typing indicator to Footer component
- [x] Maintain auto-scroll behavior for new messages

### Phase 12: Forester Theme TypeScript Refactoring
- [x] Convert graph.js (1,898 LOC monolith) to 8 focused TypeScript modules
- [x] Convert hover-card.js to TypeScript entry point
- [x] Convert forester.js to TypeScript entry point
- [x] Deduplicate serializeNode and TAXON_COLORS into shared modules
- [x] Add tsconfig.json, @types/cytoscape, typescript devDeps
- [x] Update bundle-js.sh for 3 TS entry points
- [x] Fix duplicate forester.js script tag in tree.xsl
- [x] Remove old javascript-source/ directory

### Phase 13: Quant Section
Full spec: `docs/quant-section.md`

#### 13a: Foundation
- [x] Create quant-db.ts (schema, seed 33 factors, CRUD for strategies/backtests)
- [x] Create quant page with 4 tabs (Strategies, Backtest, Results, Data)
- [x] Add nav entry with chart bar icon
- [x] Wire initQuantSchema into database initialization
- [x] Create API routes for factors, strategies, strategies/[id]

#### 13b: Data Layer
- [x] Create mock_data.py (deterministic OHLCV + fundamental generator, 50 stocks)
- [x] Create tushare_fetcher.py (dry-run/real API, populates tushare.db)
- [x] Create tushare-db.ts (separate DB accessor for market data)
- [x] Create API routes for data summary, OHLCV, and sync trigger

#### 13c: Strategy Management UI
- [x] Create factor-picker.tsx (multi-select grouped by category)
- [x] Create strategy-form.tsx (model type, hyperparams, universe)
- [x] Create strategy-list.tsx (table with actions)
- [x] Wire Strategies tab in quant page

#### 13d: Backtesting Engine
- [x] Create quant_factors.py (33 factor computation functions)
- [x] Create quant_models.py (Linear, Ridge, Lasso, RF, XGBoost wrappers)
- [x] Create quant_backtest.py (walk-forward training, trade simulation)
- [x] Create backtest-config.tsx (form for backtest parameters)
- [x] Create API routes for backtest runs with subprocess spawning
- [x] Wire Backtest tab with config form + running runs list

#### 13e: Results Dashboard
- [x] Install react-plotly.js and plotly.js-dist-min
- [x] Create equity-chart.tsx (Plotly line chart vs benchmark)
- [x] Create candlestick-chart.tsx (Plotly OHLCV with volume)
- [x] Create metrics-panel.tsx (9 metric cards with color coding)
- [x] Create monthly-returns-heatmap.tsx (Plotly heatmap)
- [x] Create factor-analysis.tsx (horizontal bar chart)
- [x] Create trade-log-table.tsx (scrollable with custom scrollbar)
- [x] Wire Results tab with all dashboard components
- [x] Wire Data tab with summary cards and sync button

#### 13f: Bug Fixes
- [x] Fix equity curve Plotly chart connecting last point to first (set xaxis type to "date")

#### 13g: Backtest Realism — Limit-Up/Limit-Down
- [x] Add limit-up/limit-down detection to backtest engine (per-board thresholds)
- [x] Skip buy orders at limit-up, skip sell orders at limit-down
- [x] Add pre_close/pct_chg columns to daily_ohlcv schema + migration
- [x] Add stk_limit table with exact up_limit/down_limit prices
- [x] Add backfill-daily and stk-limit fetch modes to tushare_fetcher.py
- [x] Backtest prefers exact stk_limit prices over computed thresholds
- [x] Fetch real data: 6.4M pre_close rows + 8.1M stk_limit rows from Tushare API

#### 13h: Quant UX Tweaks
- [x] Change Backtest tab default start/end dates to a rolling recent three-year window

#### 13i: Quant Data Automation
- [x] Add incremental Tushare update mode for daily catch-up by trade date
- [x] Add launchd-friendly Tushare update wrapper and 18:00 scheduler installer

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
| 3i - Test Database Isolation | Complete | In-memory database for tests, production data protected; `49f926a` |
| Git Housekeeping | Complete | Fixed .gitignore, pushed 16 commits, switched remote to SSH; `c2fb702` |
| 2b - Forest Bug Fixes | Complete | graph.json path fix; `3d9e0fe` (forester-repo) |
| 4 - Crawl | In progress | ArxivPanel functional with API + caching; scrollbar fix `29ef2b9` |
| 5 - Agentic Tasks | Complete (backend) | Phase 5a–5j complete (knowledge accumulation deferred); path fix `bfdbccb` |
| 6 - Crawl | In progress | ArxivPanel + Jin10Panel + SolidotPanel functional; commit `0c2f1be` |
| 7 - Home Image Migration | Complete | Images moved to data/images/ with API serving; commit `613eca1` |
| 7h - Home Expand Modal | Complete | ImageModal with expand button, three close methods, responsive layout; commits `dec2e94`-`6426b09` |
| 8 - Mobile Responsive Navigation | Complete | Portrait-responsive nav with liquid-glass design, Heroicons, blue glow; commits `b610fca`-`c7eb6cd` |
| 9 - Monitor Section & Daemon Refactor | Complete | Handler registry, monitor UI (3 tabs), investigation pipeline; commits `8c9636f`-`c106ad7` |
| 10 - Documentation & Architecture Updates | Complete | Renamed Agent to Agentic Tasks, added placeholder Agent section, updated docs; commits `f5a4ea4`, `d92a158` |
| 11a - Interactive Study Backend | Complete | DB schema, executor, task handler, API routes; commits `4aafde5`-`80ce122` |
| 11b - Interactive Study Frontend | Complete | LaTeX renderer, chat UI, study page, nav entry; commits `cb86af4`-`e57c265` |
| 11c - Interactive Study Bug Fixes | Complete | Worktree-per-session fix, status isolation, guard in execute_task; commit `5901445` |
| 11d - Interactive Study End Session | Complete | End session button, finished status, checkmark icon; commit `85494cd` |
| 11e - Interactive Study Agent Context | Complete | Inject memory and skills into worktree; commit `96bcc96` |
| 11f - Interactive Study Session Finish | Complete | Auto-record progress, copy memory, cleanup worktree; commit `2a02f92` |
| 11g - Interactive Study Message Display | Complete | Fix 100 message limit bug; commit `83fed8e` |
| 11j - Interactive Study Session Resume | Complete | CLI --resume for conversation continuity; commit `7d87347` |
| 11h - Interactive Study Progress Recording | Complete | Agent loads conversation from database; commit `b25fd1a` |
| 11i - Interactive Study Virtual Scrolling | Complete | react-virtuoso for efficient rendering; commit `31b7966` |
| 12 - Forester Theme TS Refactoring | Complete | graph.js monolith → 14 TS modules, shared utils, type safety; commit `9308047` |
| 13 - Quant Section | Complete | Factor-based model training, backtesting, Plotly charts, mock data |
| 13f - Quant Bug Fixes | Complete | Fix equity curve loop artifact; commit `636969a` |
| 13g - Backtest Limit-Up/Down | Complete | Trade filtering + stk_limit data; commits `d3bf50a`, `42830b5` |
| 13i - Quant Data Automation | Complete | Incremental Tushare updater + daily 18:00 launchd installer |
