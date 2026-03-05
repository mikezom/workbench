# DETAILED_PROGRESS.md - Session Logs

Detailed log of completed work per session, with commit IDs and file changes.

---

## 2026-03-02 — Phase 3b: Study UI & Bug Fixes

### Task 1: Cascading group delete

**Commit:** `025e674`

**Problem:** Deleting a group only removed the group entry itself. Child subgroups
and cards belonging to the group (or its descendants) were left orphaned.

**Changes:**
- `workbench/src/lib/groups.ts` — Rewrote `deleteGroup()` to collect all
  descendant IDs and remove them all. Added `getDescendantIdsSync()` helper.
- `workbench/src/lib/cards.ts` — Added `deleteCardsByGroupIds()` to bulk-remove
  cards belonging to a set of group IDs.
- `workbench/src/app/api/groups/[id]/route.ts` — DELETE handler now calls
  `deleteCardsByGroupIds()` before `deleteGroup()`.
- `workbench/src/app/study/page.tsx` — Updated the delete confirmation dialog
  to warn about subgroups and card deletion.

---

### Task 2: Sidebar layout for Study page

**Commit:** `c4cf739`

**Problem:** The Review / Cards / Settings functions were displayed as top tabs,
leaving less horizontal space for review cards.

**Changes:**
- `workbench/src/app/study/page.tsx` — Replaced the top tab bar with a left
  sidebar (`w-44`, border-separated). The main panel uses `flex-1` for full
  width. Review cards are centered with `flex flex-col items-center` and
  constrained to `max-w-xl`. Removed unused `PageContainer` import.

---

### Task 3: Fix Anki import subgroup creation

**Commit:** `30cf783`

**Problem:** Importing a `.apkg` file created subgroups for each Anki deck
within the package (e.g., "1 Recite", "2 Spelling", "3 Dictation" under
"考研词汇5500"). Each note in an Anki package is a card; the deck hierarchy
should not produce separate groups.

**Changes:**
- `workbench/src/lib/anki-import.ts` — Rewrote `parseApkg()` to create a
  single group per `.apkg` using the root deck name. All cards from all decks
  go into that one group. Removed `getFullGroupName()`, `AnkiDeck` interface,
  and per-deck note limiting. Changed parameter from `notesPerDeck` to
  `maxNotes` (default 0 = no limit).
- `workbench/src/app/api/import/anki/route.ts` — Updated to use `maxNotes`
  parameter.
- `workbench/src/app/study/page.tsx` — Removed `notesPerDeck` from the import
  FormData.

---

## 2026-03-02 — Phase 3c: Study UI Improvements & Card Model

### Task 1: Move GroupTree to sidebar

**Commit:** `dd8afe4`

**Problem:** The group selector was rendered inside each tab (ReviewTab, CardsTab)
separately, duplicating state and taking up content area space.

**Changes:**
- `workbench/src/app/study/page.tsx` — Lifted `selectedGroupId` state to
  `StudyPage`. Moved `GroupTree` rendering into the sidebar below nav tabs.
  Updated `GroupTree` styling to fit sidebar (removed border/max-width, added
  border-top separator). Updated `ReviewTab` and `CardsTab` to accept
  `selectedGroupId` as a prop instead of managing their own.

### Task 2: Progress info to bottom right & center card

**Commit:** `dd8afe4`

**Problem:** Progress info (remaining count, new/review budget) was above the
card, and the card was not centered in the panel.

**Changes:**
- `workbench/src/app/study/page.tsx` — Restructured `ReviewTab` layout to use
  `flex-col h-full` with a centered content area (`flex-1 flex items-center
  justify-center`) and a bottom-right progress section. Main panel uses
  `flex flex-col` for full-height layout.

### Task 3: Complete CRUD for cards and groups

**Commit:** `dd8afe4`

**Problem:** Card update API and UI did not support changing `group_id`.

**Changes:**
- `workbench/src/lib/cards.ts` — Added `group_id` to `updateCard()` accepted
  fields.
- `workbench/src/app/api/cards/[id]/route.ts` — PUT handler now passes
  `group_id` to `updateCard()`.
- `workbench/src/app/study/page.tsx` — Card edit form now sends `group_id` in
  the update request.

### Task 4: Title/definition/example card model

**Commit:** `dd8afe4`

**Problem:** Cards used generic `front`/`back` fields inherited from Anki.
Needed a structured model to avoid bad Anki package formatting issues.

**Changes:**
- `workbench/src/lib/cards.ts` — Added optional `title`, `definition`,
  `example` fields to `StudyCard`. Updated `createCard()`, `updateCard()`,
  and `createCardsBulk()` to accept and persist the new fields.
- `workbench/src/app/api/cards/route.ts` — POST handler accepts `title`,
  `definition`, `example` fields alongside `front`/`back`.
- `workbench/src/app/api/cards/[id]/route.ts` — PUT handler passes new fields
  through.
- `workbench/src/app/study/page.tsx` — Updated `StudyCard` interface. Review
  display: structured cards show title only, then reveal definition + example
  on click; legacy cards fall back to front/back HTML. `CardForm` rewritten
  with title/definition/example inputs. Card list shows `title` when available.

### Task 5: Category theory sample cards

**Commit:** `dd8afe4`

**Problem:** Needed sample data for style tuning of the new card layout.

**Changes:**
- `workbench/scripts/seed-category-theory.ts` — New seed script that creates
  a "Category Theory" group with 10 cards: Category, Functor, Natural
  Transformation, Adjunction, Monad, Yoneda Lemma, Limit, Colimit, Kan
  Extension, Cartesian Closed Category.
- `workbench/data/cards.json` — Populated with 10 sample cards.
- `workbench/data/groups.json` — Added "Category Theory" group.

---

## 2026-03-02 — Study UI Tuning

### Task 1: Start Review button styling

**Commit:** `1ae7b2e`

**Problem:** The "Start Review" button was small and lacked visual prominence.

**Changes:**
- `workbench/src/app/study/page.tsx` — Changed button to larger size (`px-8 py-4`,
  `text-lg`), white text on black background with white border (`border-2
  border-white`), and rounded corners (`rounded-lg`).

### Task 2: Click card to reveal answer

**Commit:** `1ae7b2e`

**Problem:** The "Show Answer" button was an extra click and broke the card
interaction flow.

**Changes:**
- `workbench/src/app/study/page.tsx` — Removed "Show Answer" button. Added
  `onClick` handler to card container to reveal answer when clicked. Added
  "Click to reveal answer" hint text. Added hover effect (`cursor-pointer`,
  `hover:border-neutral-400`) when card is clickable. Added `e.stopPropagation()`
  to rating buttons to prevent card click interference.

---

## 2026-03-03 — Forest Section: macOS Migration & Setup

### Task 1: Set up forester repo and toolchain on macOS

**Commit:** uncommitted

**Problem:** Migrating from Tencent Cloud Ubuntu server to macOS. Needed
forester CLI, theme, and the full build pipeline working locally.

**Changes:**
- Cloned `https://github.com/mikezom/forester` to `/Users/ccnas/DEVELOPMENT/forester-repo/`
- Initialized theme git submodule (switched URL from SSH to HTTPS for host key compatibility)
- Installed theme npm dependencies (`cd theme && npm install`)
- Installed `opam` via Homebrew, initialized opam, installed `forester` 5.0 via opam
- Installed `watchexec` via Homebrew for file watching
- Created `trees/` directory and ran initial `forester build`
- `forester-repo/forest.toml` — Updated URL to `http://localhost:5090/forest/`

### Task 2: Connect forester output to workbench

**Commit:** uncommitted

**Problem:** The workbench forest section had no static files to serve. The
original `public/forest/ → output/` symlink was wrong — tree pages are in
`output/forest/`, not `output/`.

**Changes:**
- Created `workbench/public/` directory
- Symlinked `workbench/public/forest/ → forester-repo/output/forest/`
  (corrected from `output/` to `output/forest/` after discovering forester's
  output structure puts tree pages and theme assets in the `forest/` subdirectory)
- `workbench/next.config.mjs` — Replaced stale root-level afterFiles rewrites
  (designed for URL-at-root scheme) with two fallback rewrites that serve
  `index.xml` for `/forest/:tree/` directory paths. This fixes local link
  navigation (Next.js doesn't auto-serve `index.xml` as directory index).

### Task 3: Fix fonts

**Commit:** uncommitted

**Problem:** Font files (Inria Sans, Source Han Sans/Serif, KaTeX) were missing
from the theme, causing 404s on every page load.

**Changes:**
- Copied KaTeX fonts from `theme/node_modules/katex/dist/fonts/` to `theme/fonts/`
- User manually placed Inria Sans and Source Han Sans/Serif woff2 files in `theme/fonts/`
- Rebuilt forester so fonts propagate to `output/forest/fonts/`

### Task 4: Fix external links opening in iframe

**Commit:** uncommitted

**Problem:** Clicking external links (e.g., GitHub URLs) navigated within the
iframe instead of opening a new browser window.

**Changes:**
- `forester-repo/theme/links.xsl` — Added `target="_blank" rel="noopener noreferrer"`
  to external link template (for `type="external"` and non-local links with `display-uri`)
- `forester-repo/theme/metadata.xsl` — Added `target="_blank" rel="noopener noreferrer"`
  to DOI, external, slides, and video meta link templates

### Task 5: Create startup script

**Commit:** uncommitted

**Changes:**
- `/Users/ccnas/DEVELOPMENT/start-workbench.sh` — New script that starts
  `npm run dev`, runs initial `forester build`, and launches `watchexec` to
  watch `trees/` and `forest.toml` for changes. Handles cleanup on Ctrl+C.

---

## 2026-03-03 — Phase 3d: Study Queue System + SQLite Migration

### Design & Planning

**Commits:** `ae51de9`, `ee4b497`

**Problem:** The review session showed each card exactly once regardless of rating.
Cards rated "Again" should re-enter the session after a short delay. Additionally,
JSON file storage needed replacing with SQLite for performance.

**Changes:**
- `docs/plans/2026-03-03-study-queue-sqlite-design.md` — Design doc covering
  data model (SQLite tables for cards, groups, study_log), session behavior
  (intra-day re-queuing), new card distribution, and migration strategy.
- `docs/plans/2026-03-03-study-queue-sqlite-plan.md` — 9-task implementation plan.

---

### Task 1: SQLite foundation

**Commit:** `07ad46d`

**Changes:**
- `workbench/src/lib/db.ts` — Created SQLite database layer with `getDb()`
  singleton, `CREATE TABLE IF NOT EXISTS` schema for cards/groups/study_log
  tables, and JSON-to-SQLite migration logic that reads existing JSON files
  and inserts into SQLite, then renames originals to `.bak`.
- `workbench/src/app/api/migrate/route.ts` — POST endpoint to trigger migration.

---

### Task 2: Groups DB layer

**Commit:** `d7ff797`

**Changes:**
- `workbench/src/lib/db.ts` — Added `getAllGroups()`, `createGroup()`,
  `updateGroup()`, `deleteGroupCascade()`, `getDescendantIds()` functions.
- `workbench/src/app/api/groups/route.ts` — Switched imports from `@/lib/groups`
  to `@/lib/db`.
- `workbench/src/app/api/groups/[id]/route.ts` — Switched to `deleteGroupCascade`.

---

### Task 3: Cards DB layer + distribution

**Commit:** `647b20b`

**Changes:**
- `workbench/src/lib/db.ts` — Added `getAllCards()`, `getCard()`, `createCard()`,
  `updateCard()`, `deleteCard()`, `createCardsBulk()`, `computeNewCardSlot()`
  for distributing new cards across day-slots under daily_new_limit.
- `workbench/src/app/api/cards/route.ts` — Switched imports to `@/lib/db`.
- `workbench/src/app/api/cards/[id]/route.ts` — Switched imports to `@/lib/db`.

---

### Task 4: Study log + Review API

**Commit:** `2e24bb3`

**Changes:**
- `workbench/src/lib/db.ts` — Added `getRolloverBoundary()`,
  `getGroupStudiedToday()`, `reviewCard()` wrapping FSRS scheduling + DB update
  + study_log insert.
- `workbench/src/app/api/cards/[id]/review/route.ts` — Returns
  `{ card, scheduledAt, intervalMinutes }` from `reviewCard()`.
- `workbench/src/app/api/study-log/route.ts` — Switched imports to `@/lib/db`.

---

### Task 5: Session API endpoint

**Commit:** `7eaa45a`

**Changes:**
- `workbench/src/lib/db.ts` — Added `getSessionCards()` returning due cards with
  rollover-aware daily budget enforcement.
- `workbench/src/app/api/cards/session/route.ts` — GET endpoint returning session
  cards, nextRollover, and budgetInfo.

---

### Task 6: Anki import update

**Commit:** `92d0d4f`

**Changes:**
- `workbench/src/app/api/import/anki/route.ts` — Removed direct JSON file writing,
  uses `createGroup` and `createCardsBulk` from `@/lib/db`. Remaps parser group
  IDs to new DB-generated IDs.

---

### Task 7: ReviewTab rewrite

**Commit:** `9f13554`

**Changes:**
- `workbench/src/app/study/page.tsx` — Complete rewrite of `ReviewTab` with:
  - `immediateQueue` + `delayedCards` (with `availableAt`) state management
  - Session loaded from `/api/cards/session?group_id=X`
  - Intra-day re-queuing: cards with `scheduledAt < nextRollover` are delayed
    and re-enter queue when their delay expires
  - Countdown timer showing "M:SS" while waiting for delayed cards
  - 4 UI states: not started, card present, waiting (countdown), complete

---

### Task 8–9: Settings UI + Cleanup

**Commit:** `90953af`

**Changes:**
- `workbench/src/app/study/page.tsx` — Added rolloverHour input (0-23) to
  GroupSettingsEditor with grid-cols-3 layout. SettingsTab shows "Rollover: X:00".
- Deleted `workbench/src/lib/cards.ts`, `workbench/src/lib/groups.ts`,
  `workbench/src/lib/study-log.ts` (replaced by `db.ts`).
- `.gitignore` — Added `data/workbench.db`, `data/workbench.db-wal`,
  `data/workbench.db-shm`, `data/*.bak`.

---

### Bug fixes

**Commits:** `99e5ad9`, `3bf802a`, `4e5c3ee`

**Changes:**
- `workbench/src/lib/db.ts` — Fixed `getGroupStudiedToday()` to account for
  descendant groups (was only checking parent). Fixed `getRolloverBoundary()`
  to use local time instead of UTC. Wrapped `reviewCard()` UPDATE+INSERT in
  a transaction.
- `workbench/src/app/study/page.tsx` — Removed unused `groups` prop from
  ReviewTab. Removed unused `DayGroupLog` interface.

---

## 2026-03-03 — Replace delayed card queue with immediate requeuing

### Immediate requeue for intra-day cards

**Commit:** `d71a95a`

**Problem:** The review session used a delayed queue with a countdown timer for
cards scheduled within the same day. Users had to wait for a "Waiting for cards..."
screen before those cards reappeared. This was disruptive to the review flow.

**Changes:**
- `workbench/src/app/study/page.tsx` — Removed `delayedCards` state, countdown
  timer (`timerRef`, `promoteDelayed`), and "Waiting for cards..." UI. Cards
  scheduled before `nextRollover` are now immediately appended to the end of
  `immediateQueue` after review. Progress info simplified from
  "X ready | Y delayed" to "X remaining".

---

## 2026-03-03 — Git Housekeeping & Push

### Task 1: Fix .gitignore patterns and commit project docs

**Commit:** `c2fb702`

**Problem:** Several `.gitignore` patterns were incorrect — SQLite DB entries
used `data/workbench.db` (anchored to repo root) but actual files were at
`workbench/data/workbench.db`. The `.next/` directory at the repo root also
wasn't covered. Additionally, PROGRESS.md, REFLECTION.md, and
DETAILED_PROGRESS.md had unstaged changes, and 15 commits had never been pushed
to origin.

**Changes:**
- `.gitignore` — Changed SQLite patterns from `data/workbench.db` to
  `**/workbench.db` (and similarly for `-wal`, `-shm`). Changed `data/*.bak`
  to `*.json.bak`. Added root-level `.next/` pattern alongside existing
  `workbench/.next/`.
- `DETAILED_PROGRESS.md` — Committed accumulated session logs.
- `PROGRESS.md` — Committed accumulated phase status updates.
- `REFLECTION.md` — Committed accumulated reflection entries.

### Task 2: Push to remote and clean up

**Problem:** 16 commits were local-only. The `task/study-queue-sqlite` branch
was stale (already merged). The remote used HTTPS which lacked credentials.

**Changes:**
- Deleted stale branch `task/study-queue-sqlite`.
- Switched remote URL from HTTPS to SSH (`git@github.com:mikezom/workbench.git`).
- Added GitHub host key to `~/.ssh/known_hosts` via `ssh-keyscan`.
- Pushed all 16 commits to `origin/main`.

---

## 2026-03-03 — Phase 3f: Study Scroll & Review Info

### Task 1: Scroll isolation, review info display, and zero-cards congratulations

**Commit:** `b6a65fa`

**Problem:** The right panel (Cards/Settings tabs) scrolled the entire page including
both sidebars. The Review tab showed no card count information before starting a
session. Groups with no due cards still displayed a Start Review button.

**Changes:**
- `workbench/src/app/layout.tsx` — Changed root container from `min-h-screen` to
  `h-screen` so inner flex children fill exactly the viewport height, enabling
  independent scroll contexts.
- `workbench/src/app/study/page.tsx` — Added `overflow-y-auto` to study sidebar
  for independent scrolling when many groups exist. Added `fetchBudgetInfo()`
  callback that calls the session API on mount and group change to display
  new/review card counts before starting a session. When both `newAvailable` and
  `reviewAvailable` are zero, shows a congratulations message instead of the
  Start Review button.
- `PROGRESS.md` — Added Phase 3f section and status table entry.

---

## 2026-03-03 — Fix Forest graph data loading

### Task 1: Fix graph.json output path in forester-repo

**Commit:** `3d9e0fe`

**Problem:** The Forest section's graph panel showed "Graph data not available" because `aggregate_graph.py` wrote `graph.json` to `output/` while `graph.js` fetched it from `output/forest/` (the symlinked serving root).

**Changes:**
- `aggregate_graph.py` — Changed output path from `output/graph.json` to `output/forest/graph.json` to match the theme's fetch URL.

---

## 2026-03-03 — Agent Section Phase 5a & 5b (Database, Config, API Routes)

### Task 1: Agent database tables, operations, and config file

**Commit:** `a4094c0`

**Problem:** The Agent section needs persistent storage for tasks, execution output, and a global lock, plus a config file for LLM provider settings.

**Changes:**
- `workbench/src/lib/agent-db.ts` — Created with 3 tables (agent_tasks, agent_task_output, agent_lock), types, task CRUD, lock management, and output logging operations.
- `workbench/src/lib/db.ts` — Added import and call to `initAgentSchema()` in `getDb()`.
- `workbench/data/agent-config.json` — Created default LLM config (Anthropic provider, empty API key). Gitignored.
- `.gitignore` — Added entries for agent-config.json, .worktrees/, and logs/.
- `docs/agent-section.md` — Committed the full Agent section technical spec.
- `docs/plans/2026-03-03-agent-5a-db-config.md` — Committed the implementation plan.

---

### Task 2: Agent API routes

**Commit:** `38a7b41`

**Problem:** The Agent UI (Phase 5c) needs API endpoints for task management, execution output retrieval, LLM-based task decomposition, and config CRUD.

**Changes:**
- `workbench/src/app/api/agent/tasks/route.ts` — GET (list with optional ?status= filter) and POST (create task).
- `workbench/src/app/api/agent/tasks/[id]/route.ts` — GET (detail), PUT (update/cancel), DELETE.
- `workbench/src/app/api/agent/tasks/[id]/output/route.ts` — GET with ?limit= and ?offset= pagination.
- `workbench/src/app/api/agent/decompose/route.ts` — POST that calls configured LLM (Anthropic or OpenAI-compatible) to decompose a prompt into atomic sub-tasks.
- `workbench/src/app/api/agent/config/route.ts` — GET (reads config, masks API key) and PUT (merges updates, saves).
- `workbench/src/lib/agent-config.ts` — Extracted shared config read/write functions to avoid Next.js route export restriction.

---

## 2026-03-03 — Agent Section Phase 5c (Agent UI)

### Task 1: Agent UI — task board, detail modal, config panel

**Commit:** `f0c0b67`

**Problem:** The `/agent` page was a placeholder ("Coming soon"). Needed a full UI for submitting prompts, viewing task status across 6 Kanban columns, inspecting task details/output, cancelling tasks, and configuring the LLM provider.

**Changes:**
- `workbench/src/app/agent/page.tsx` — Complete rewrite from placeholder to 500+ line client component with:
  - `PromptInput` — textarea with "Decompose" (LLM sub-task decomposition with editable preview) and "Direct" (single task creation) submit modes.
  - `TaskBoard` — 3x2 CSS grid of 6 status columns (Waiting for Dev, Developing, Waiting for Review, Finished, Failed, Cancelled) with colored status dots and task counts.
  - `TaskCard` — compact card with colored left border per status, title, timestamp, and enlarge (detail) button.
  - `TaskDetailModal` — overlay showing task title/status, prompt, dark terminal-style output area (polls every 3s for active tasks), cancel and delete buttons, branch/commit info footer.
  - `ConfigPanel` — modal with provider dropdown (Anthropic/OpenAI/Other), model text input, password-masked API key field, base URL input, save with feedback.
  - Main `AgentPage` — orchestrates all components, auto-polls task list every 5s.

---

## 2026-03-03 — Agent Section Phase 5d (Polling Daemon)

### Task 1: Polling daemon, launchd plist, and logs directory

**Commit:** `dc21b6a`

**Problem:** The Agent section can create tasks and display them on a task board, but nothing picks them up for execution. Needed a polling daemon to bridge the UI and execution pipeline.

**Changes:**
- `workbench/scripts/agent-daemon.py` — Created Python polling daemon with: main loop polling every 5s for `waiting_for_dev` tasks, DB operations mirroring `agent-db.ts` (is_locked, acquire_lock, release_lock, get_next_pending_task, update_task_status, append_output, check_cancelled), stub executor sleeping in 1s intervals with cancellation checks, stale lock recovery on startup (force-releases locks older than 30 min), SIGTERM/SIGINT signal handling for graceful shutdown. Uses `from __future__ import annotations` for Python 3.9 compatibility.
- `~/Library/LaunchAgents/com.workbench.agent-daemon.plist` — Created launchd plist with RunAtLoad, KeepAlive, correct absolute paths for script, working directory, and log files.
- `workbench/logs/.gitkeep` — Created logs directory for launchd stdout/stderr output (directory already gitignored).

---

## 2026-03-03 — Agent Section Phase 5e (Execution Pipeline)

### Task 1: Executor scaffolding and worktree management

**Commit:** `2f5ab6b`

**Problem:** The agent daemon had a stub executor that slept for 10 seconds. Needed
the foundation for the real execution pipeline — executable discovery, utilities, and
git worktree create/cleanup.

**Changes:**
- `workbench/scripts/agent_executor.py` — Created new Module C file with: `_find_executable()` that resolves `claude` and `npm` via nvm paths (for launchd's minimal PATH), `REPO_ROOT` computed 3 levels up to the git root, `slugify()`, `check_cancelled()`, `append_output()`, `_run_git()`, `create_worktree()`, and `cleanup_worktree()`.
- `.gitignore` — Changed `.worktrees/` pattern from `workbench/.worktrees/` to root-level `.worktrees/` to match actual worktree location at the git root.

---

### Task 2: Claude Code CLI invocation with stream-json parsing

**Commit:** `9a127c8`

**Problem:** Needed to invoke Claude Code CLI, parse its stream-json output, and
store categorized events in the DB for UI consumption.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `_kill_process()` (SIGTERM→SIGKILL escalation), `_store_event()` (categorizes stream-json events by type: assistant, result, tool_use, tool_result, system, unknown), and `invoke_claude()` (launches CLI with `--output-format stream-json`, reads stdout line-by-line, periodic cancellation checks, subprocess lifecycle management).

---

### Task 3: Rebase onto main with iterative conflict resolution

**Commit:** `abc8990`

**Problem:** After Claude finishes, changes need to be rebased onto main. Conflicts
must be resolved iteratively by invoking Claude with conflict context.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `_is_rebase_in_progress()` (checks `git status` for rebase state) and `rebase_onto_main()` (fetches origin, attempts rebase, on conflict loops up to 3 times invoking Claude with git status/diff context, aborts on exhaustion).

---

### Task 4: Build validation with iterative fix loop

**Commit:** `7b7e366`

**Problem:** Need to validate that Claude's changes compile by running `npm run build`
in the worktree's workbench/ directory, with iterative fix attempts.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `run_build()` that runs `npm run build` with 5-minute timeout, on failure invokes Claude to fix errors (up to 3 attempts), truncates large build output to 5000 chars.

---

### Task 5: execute_task orchestrator

**Commit:** `42c881c`

**Problem:** Needed a top-level function orchestrating the full lifecycle: worktree →
Claude → rebase → build, with proper cleanup on cancel and preservation on failure.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `execute_task()` that creates worktree, updates DB with branch_name/worktree_path, invokes Claude, rebases, runs build. Cleans up worktree on cancellation, preserves on failure for debugging.

---

### Task 6: Wire daemon to real executor

**Commit:** `1e41554`

**Problem:** The daemon still used the stub executor. Needed to import and call the
real pipeline.

**Changes:**
- `workbench/scripts/agent-daemon.py` — Imported `execute_task` and `CancelledError` from `agent_executor`. Removed stub function, `STUB_DURATION_SECONDS`, updated main loop to call `run_task_pipeline()`. Updated docstring.

---

### Task 7: File rename and code review fixes

**Commits:** `7718813`, `276854e`

**Problem:** File was named `agent-executor.py` (hyphen) which Python cannot import.
Code review found duplicate CancelledError classes, missing system output message,
no max-turns safety bound, and missing slugify fallback for empty titles.

**Changes:**
- `workbench/scripts/agent_executor.py` — Renamed from `agent-executor.py`. Added `--max-turns 50` to Claude CLI args. Added "Invoking Claude Code CLI..." system output. Added `or "untitled"` fallback in `slugify()`.
- `workbench/scripts/agent-daemon.py` — Removed local `CancelledError` class, imports it from `agent_executor` instead. Simplified except clause.

---

## 2026-03-03 — Agent Section Phase 5f (CLAUDE.md Files for Agents)

### Task 1: Create CLAUDE.md instruction files

**Commits:** `76fa691`, `cb0533a`

**Problem:** Agent tasks executed in worktrees had no project context — Claude Code ran with only the raw task prompt, missing coding conventions, project structure, and known pitfalls. The decompose route used a hardcoded system prompt with no project-specific knowledge.

**Changes:**
- `workbench/data/agent-working-claude.md` — Created working agent instructions: project structure, tech stack, coding conventions, git workflow (stay on task branch), build validation requirements, known pitfalls (from REFLECTION.md), and prohibited actions.
- `workbench/data/agent-decompose-claude.md` — Created decompose agent system prompt: decomposition rules, good sub-task prompt examples, project structure knowledge, and JSON output format.

---

### Task 2: Wire CLAUDE.md files into execution pipeline

**Commits:** `b3c9b2a`, `6949a36`

**Problem:** The two CLAUDE.md files existed but weren't consumed by anything.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `inject_claude_md()` helper that copies `workbench/data/agent-working-claude.md` from the worktree to the worktree root as `CLAUDE.md` (for Claude Code auto-discovery). Called in `execute_task()` after worktree creation, before Claude invocation.
- `workbench/src/app/api/agent/decompose/route.ts` — Added `fs` and `path` imports. Replaced hardcoded `systemPrompt` with dynamic loading from `data/agent-decompose-claude.md` via `readFileSync`, with fallback to the original hardcoded string if the file is missing.

---

## 2026-03-04 — Agent Section Phase 5g: Auto-finish & Clarification Questions

### Design & Planning

**Commits:** `82d19be`, `2f831b4`

**Problem:** Tasks that passed build still required manual promotion to "Finished". The "Waiting for Review" status had no mechanism for agent-user interaction when clarification was needed.

**Changes:**
- `docs/plans/2026-03-04-agent-autofinish-questions-design.md` — Design doc covering auto-merge on success and exit+re-invoke pattern for clarification questions via questions.json file convention.
- `docs/plans/2026-03-04-agent-autofinish-questions-plan.md` — 9-task implementation plan.

---

### Task 1: Agent task questions DB layer

**Commit:** `f0bdc63`

**Problem:** Needed persistent storage for agent clarification questions and user answers.

**Changes:**
- `workbench/src/lib/agent-db.ts` — Added `agent_task_questions` table (with index) to `initAgentSchema()`. Added `AgentTaskQuestion` interface. Added `saveQuestions()` (transactional bulk insert), `getQuestions()`, `answerQuestions()` (transactional bulk update), and `getTasksReadyToResume()` (query for answered waiting_for_review tasks).

---

### Task 2: Questions API route

**Commit:** `b5266e8`

**Problem:** The UI needed an endpoint to fetch questions and submit answers.

**Changes:**
- `workbench/src/app/api/agent/tasks/[id]/questions/route.ts` — Created GET (fetches questions, parses options JSON for client) and POST (validates task is waiting_for_review, stores answers).

---

### Task 3: Executor auto-merge and questions detection

**Commit:** `55530c6`

**Problem:** The executor needed to merge successful tasks into main, detect questions.json files, and support resuming tasks after user answers.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `QuestionsAsked` exception. Added `merge_into_main()` (checkout main, merge branch, get SHA, cleanup). Added `check_questions()` (parse/validate questions.json) and `save_questions_to_db()`. Rewrote `execute_task()` to check for questions after Claude exits and auto-merge on success. Added `resume_task()` for re-invocation with Q&A context.

---

### Task 4: Daemon auto-finish and resume

**Commit:** `f8cdd4b`

**Problem:** The daemon needed to set finished status on success (not waiting_for_review), handle QuestionsAsked, and pick up resumable tasks.

**Changes:**
- `workbench/scripts/agent-daemon.py` — Imported `resume_task` and `QuestionsAsked`. Added `get_task_ready_to_resume()`. Changed success status to `finished`. Added `QuestionsAsked` handler setting `waiting_for_review`. Added else clause checking for resumable tasks and calling `run_resume_pipeline()`.

---

### Task 5: Questions UI in task detail modal

**Commits:** `8205370`, `e1f3723`

**Problem:** Users needed a way to see agent questions and select answers in the web UI.

**Changes:**
- `workbench/src/app/agent/page.tsx` — Added `AgentTaskQuestion` type. Added questions state, `fetchQuestions` callback, and `handleSubmitAnswers` handler. Extended polling to include `waiting_for_review`. Added purple-themed questions panel with radio buttons, previously-answered section, and disabled-until-complete submit button. Fixed polling stop condition to also keep polling during `waiting_for_review`.

---

### Task 6: Working agent CLAUDE.md questions convention

**Commit:** `09b683d`

**Problem:** Agents in worktrees needed instructions on how to ask clarification questions.

**Changes:**
- `workbench/data/agent-working-claude.md` — Added "Asking Clarification Questions" section with questions.json format, rules (unique IDs, 2-4 options, stop after writing), and example.

---

### Task 7: Agent section documentation update

**Commit:** `6dd4f21`

**Problem:** The agent-section.md technical description needed to reflect the new auto-finish and questions flow.

**Changes:**
- `docs/agent-section.md` — Updated architecture diagram, task statuses table, execution pipeline lifecycle (added questions check, merge, resume lifecycle), database schema (added agent_task_questions table), and key files table.

---

### Task 8: PROGRESS.md update

**Commit:** `34f1966`

**Problem:** PROGRESS.md needed phase 5g tracking items.

**Changes:**
- `PROGRESS.md` — Added phase 5g sub-section with 7 checked items. Updated status table to reflect 5a-5g complete.

---

## 2026-03-04 — Phase 5: Agent Worktree Optimization

### Task 1: Symlink node_modules in worktrees

**Commit:** `81e541b`

**Problem:** Each git worktree created by the agent executor duplicated the full `node_modules` directory (~393MB), wasting disk space and time.

**Changes:**
- `workbench/scripts/agent_executor.py` — Added `symlink_node_modules()` function that creates a symlink from `<worktree>/workbench/node_modules` to the main checkout's `node_modules`. Called as Step 1c in `execute_task()` after CLAUDE.md injection. Handles existing dirs/stale symlinks gracefully.

---

## 2026-03-04 — Agent Skill-Based Phased Pipeline

### Task 1: Add vitest and create TDD pipeline for agents

**Commit:** `49866e8`

**Problem:** The working agent received a flat CLAUDE.md with no behavioral structure — it decided work order, testing, and committing on its own. Needed a deterministic phased pipeline enforced by skill files, and a test framework for the TDD loop.

**Changes:**
- `workbench/package.json` — Added `vitest ^3.0.0` to devDependencies, added `test` and `test:watch` scripts.
- `workbench/vitest.config.ts` — New vitest config with node environment, globals, `@` alias, co-located test pattern (`src/**/*.test.ts`), passWithNoTests.
- `workbench/data/agent-skills/agent-understand-task.md` — Phase 1: read docs, assess clarity, ask questions or proceed.
- `workbench/data/agent-skills/agent-write-failing-test.md` — Phase 2 (RED): write meaningful failing tests before implementation.
- `workbench/data/agent-skills/agent-implement-minimal.md` — Phase 3 (GREEN): minimum code to pass tests.
- `workbench/data/agent-skills/agent-verify-green.md` — Phase 4: full test suite + build, loop back or continue.
- `workbench/data/agent-skills/agent-commit.md` — Phase 5: focused commit, no docs files.
- `workbench/data/agent-skills/agent-reflection-after-work.md` — Phase 6: update PROGRESS/REFLECTION, separate commit, DONE.
- `workbench/data/agent-working-claude.md` — Rewritten as pipeline skeleton with condensed project context and phase entry point routing.

---

## 2026-03-04 — Utility Function: Date Formatting

### Add formatDate utility to src/lib/

**Date**: 2026-03-04

**Commit**: `8750d38`

**Files changed**:
- `workbench/src/lib/date-utils.ts` — New utility file with `formatDate()` function
- `workbench/src/lib/date-utils.test.ts` — Test suite with 5 test cases

**Summary**: Created a utility function that formats Date objects as YYYY-MM-DD strings with proper zero-padding for single-digit months and days. Uses local time. Includes comprehensive tests covering edge cases (year boundaries, leap years).

---

## 2026-03-04 — Theme Toggle Button

### Add dark/light theme toggle to sidebar

**Date**: 2026-03-04

**Commit**: `fb86764`

**Files changed**:
- `workbench/src/lib/theme.ts` — Theme utility module with localStorage persistence
- `workbench/src/lib/theme.test.ts` — Test suite for theme utilities (11 tests)
- `workbench/src/components/nav.tsx` — Added theme toggle button at bottom of sidebar
- `workbench/tailwind.config.ts` — Configured class-based dark mode
- `workbench/vitest.config.ts` — Changed environment from node to happy-dom for browser API testing
- `workbench/package.json` — Added happy-dom dev dependency

**Summary**: Implemented a dark/light theme toggle button positioned at the bottom of the navigation sidebar. The theme preference is persisted in localStorage and applied via Tailwind's class-based dark mode. Updated test environment to support browser APIs (localStorage, document).

---

## 2026-03-04 — Dark Mode Color Fixes

### Task 1: Fix dark mode to use true neutral grays

**Commit:** `b07fb19`

**Problem:** Dark mode was displaying blue-tinted grays instead of true neutral grays across all sections. The global CSS was using `prefers-color-scheme` media query instead of Tailwind's class-based dark mode, and individual components were using `gray-*` colors which have a blue tint.

**Changes:**
- `workbench/src/app/globals.css` — Replaced CSS variables with Tailwind dark mode classes (`dark:bg-neutral-950`) to respond to manual theme toggle instead of system preference.
- `workbench/src/app/layout.tsx` — Added `bg-white dark:bg-neutral-900` to main element to ensure full-page background coverage.
- `workbench/src/components/page-container.tsx` — Changed from `dark:bg-gray-900` to `dark:bg-neutral-900` and updated text colors to use neutral palette.
- `workbench/src/app/agent/page.tsx` — Changed from `dark:bg-gray-900` to `dark:bg-neutral-900` for consistent true gray background.
- `workbench/src/app/forest/page.tsx` — Changed from `dark:bg-gray-900` to `dark:bg-neutral-900` and updated "Forest" label to `dark:text-neutral-100` (white) for better contrast.
- `workbench/src/app/study/page.tsx` — Changed from `dark:bg-gray-900` to `dark:bg-neutral-900` and updated "Start Review" button to transparent background with themed outline (`border-neutral-900` in light mode, `border-neutral-400` in dark mode).

---

## 2026-03-04 — Clipboard Section Implementation

### Task 1: Implement clipboard UI with CRUD and infinite scroll

**Commit:** `c003b10`

**Problem:** The clipboard section had a complete backend (database layer, API routes, tests) but only a placeholder UI. Needed a full-featured snippet manager with create/edit/delete functionality, copy to clipboard, and infinite scroll pagination.

**Changes:**
- `workbench/src/app/clipboard/page.tsx` — Implemented complete UI with create form (textarea + optional language input), card-based snippet list, inline editing mode, copy to clipboard with feedback, delete with confirmation, and infinite scroll using IntersectionObserver (loads 10 items at a time).
- `docs/clipboard-section.md` — Created comprehensive technical documentation including database schema, API reference, UI layout diagram, data flow diagrams, feature descriptions, common pitfalls, and future enhancement notes.

---

## 2026-03-04 — Clipboard Delete Confirmation UX

### Task 1: Replace confirm() dialog with animated button confirmation

**Commit:** `8ef0cc2`

**Problem:** The clipboard delete button used browser's native confirm() dialog which is visually inconsistent with the app's design and interrupts the user flow.

**Changes:**
- `workbench/src/app/clipboard/page.tsx` — Replaced confirm() dialog with two-step button confirmation. Added `confirmDeleteId` state and `confirmTimeoutRef` to track confirmation state. Modified `handleDelete()` to require two clicks: first click fills button with red and shows "Confirm?", second click deletes. Auto-cancels after 3 seconds. Added cleanup for timeout on component unmount.

---

## 2026-03-04 — Decompose Feature Build Fixes

### Task 1: Fix build errors in decompose feature UI

**Commit:** `856a7bf`

**Problem:** The decompose feature implementation was complete but had build errors preventing compilation. The agent page had orphaned JSX code from incomplete removal of old decomposed tasks preview, and TypeScript errors from missing decompose status colors in STATUS_COLORS and STATUS_DOT constants.

**Changes:**
- `workbench/src/app/agent/page.tsx` — Removed orphaned JSX code (lines 225-274) from old decomposed tasks preview that was left behind when simplifying PromptInput component. Added 8 decompose status colors to STATUS_COLORS constant (purple/blue/indigo/green variants). Added 8 decompose status colors to STATUS_DOT constant. Updated AgentTaskStatus type to include decompose statuses. Updated AgentTask interface to include decompose fields (parent_task_id, task_type, decompose_breakdown, decompose_user_comment, user_task_comment). Removed unused DecomposedTask interface and decomposed state from PromptInput.
- `DECOMPOSE_STATUS.md` — Created status document summarizing build fixes, current state, and next steps for testing the decompose feature.
- `DECOMPOSE_IMPLEMENTATION.md` — Comprehensive implementation summary documenting all 6 phases of decompose feature (skills, database schema, executor, daemon, API routes, critical UI), three-phase workflow, architecture highlights, and testing instructions.
- `DECOMPOSE_REFLECTION.md` — Created separate reflection file for decompose agent to track decomposition patterns and lessons learned independently from worker agent reflection.
- `workbench/data/agent-decompose-claude.md` — Rewritten as pipeline skeleton with phase routing logic based on context (similar to agent-working-claude.md).
- `workbench/scripts/agent_executor.py` — Added 4 decompose execution functions (execute_decompose_task, resume_decompose_task, retry_decompose_breakdown, execute_decompose_reflection) and helper functions for file management.
- `workbench/scripts/agent-daemon.py` — Added 4 polling functions for decompose task states and integrated decompose handling into main polling loop.
- `workbench/src/lib/agent-db.ts` — Updated schema with decompose support (added parent_task_id, task_type, decompose_breakdown, decompose_user_comment, user_task_comment columns and 8 new decompose statuses). Added helper functions: getSubTasks, areAllSubTasksCommented, getDecomposeTasksReadyForReflection.
- `workbench/src/lib/migrate-decompose.ts` — Created migration script for adding decompose columns to agent_tasks table.
- `workbench/src/app/api/agent/decompose/route.ts` — Updated to create decompose task instead of SDK call.
- `workbench/src/app/api/agent/decompose/[id]/route.ts` — New route to get decompose task details (questions, breakdown, status).
- `workbench/src/app/api/agent/decompose/[id]/answers/route.ts` — New route to submit answers to decompose questions.
- `workbench/src/app/api/agent/decompose/[id]/approve/route.ts` — New route to approve breakdown and create sub-tasks.
- `workbench/src/app/api/agent/decompose/[id]/reject/route.ts` — New route to reject breakdown with comments.
- `workbench/src/app/api/agent/decompose/[id]/subtasks/route.ts` — New route to get all sub-tasks for a decompose task.
- `workbench/src/app/api/agent/migrate-decompose/route.ts` — New route to run decompose migration.
- `workbench/src/app/api/agent/tasks/[id]/comment/route.ts` — New route to add user comment to completed task for reflection phase.
- `REFLECTION.md` — Updated with lessons learned from decompose implementation.
- Deleted `workbench/data/agent-skills/` directory — Skills moved to `~/.claude/skills/` as per new architecture.

**Summary**: Fixed build errors in decompose feature by removing orphaned JSX code and adding missing status colors. The decompose feature replaces SDK-based task decomposition with Claude Code CLI-based autonomous decomposition using a three-phase workflow (Planning/Clarification → User Confirmation/Delegation → Review/Reflection). Build now succeeds. Dev server needs restart to test the feature end-to-end.

---

## 2026-03-05 — Crawl Section Panel Layout

### Change crawl panel grid to 3 columns per row

- **Date**: 2026-03-05
- **Commit**: `df1144a`
- **Files changed**: `workbench/src/app/crawl/page.tsx`
- **Summary**: Changed the crawl section panel grid from `grid-cols-1` to `grid-cols-3` to match the agent section's 3-panel-per-row layout. Panels now display as a 3x2 grid (arXiv, Hacker News, Lobsters / nLab, Planet Haskell, Reddit).

---

## 2026-03-05 — Agent Pipeline Fix: Isolate Decompose in Worktrees

### Task 1: Untrack CLAUDE.md and isolate decompose agent in worktrees

**Commit:** `2c70c8d`

**Problem:** A previous agent committed decompose-agent instructions as CLAUDE.md to main (commit `fd726bb`). This caused decompose documents to leak into every worker worktree created from main. The decompose agent also ran directly in the repo root, risking file pollution.

**Changes:**
- `.gitignore` — Added `CLAUDE.md` to ignore list (injected dynamically at runtime by both agent types).
- `CLAUDE.md` — Removed from git tracking via `git rm --cached`.
- `workbench/scripts/agent_executor.py` — Unified `inject_claude_md(path, agent_type)` replacing separate `inject_decompose_claude_md` / `remove_decompose_claude_md`. Moved all four decompose functions (`execute_decompose_task`, `resume_decompose_task`, `retry_decompose_breakdown`, `execute_decompose_reflection`) from running in `REPO_ROOT` to isolated worktrees with proper create/cleanup lifecycle. Removed dead code: `cleanup_decompose_files`, `remove_claude_md`.
- `DECOMPOSE_IMPLEMENTATION.md` — Deleted (unneeded).
- `DECOMPOSE_STATUS.md` — Deleted (unneeded).

---

## 2026-03-05 — Decompose Agent Path Fixes

### Task 1: Fix decompose agent breakdown.json path and answered-questions UI

**Commit:** `bfdbccb`

**Problem:** Decompose agents were moved to worktrees in Phase 5j, but skill files and CLAUDE.md still had hardcoded absolute paths (e.g., `/Users/ccnas/DEVELOPMENT/workbench/breakdown.json`). The executor checks for output files relative to the worktree, so agents wrote them to the wrong location. Additionally, the UI showed answered clarification questions as a form instead of a "waiting for agent" message.

**Changes:**
- `workbench/data/agent-decompose-claude.md` — Changed project structure comment from hardcoded path to `<repo-root>/`, clarified `decompose-questions.json` should be written to CWD.
- `workbench/src/app/agent/page.tsx` — Replaced DecomposeModal popup with inline decompose interactions in TaskDetailModal. Added ACTIVE_STATUSES for polling control. Added answered-questions check to show "waiting for agent" message instead of re-showing the form.
- `~/.claude/skills/decompose-agent-breakdown-task/skill.md` — Changed `breakdown.json` path from hardcoded absolute to relative (CWD). Updated example prompts to use relative doc paths.
- `~/.claude/skills/decompose-agent-understand-task/skill.md` — Changed documentation paths (PROGRESS.md, section docs) from hardcoded absolute to relative.
- `~/.claude/skills/decompose-agent-reflection/skill.md` — Changed `reflection-complete.json`, `reflection-retry.json`, and `DECOMPOSE_REFLECTION.md` paths from hardcoded absolute to relative (CWD).

---

## 2026-03-05 — Phase 4: Crawl Section — arXiv API Proxy Route

### Task: Create arXiv API proxy route

- **Date**: 2026-03-05
- **Commit**: `7ee89dc`
- **Files changed**:
  - `workbench/src/app/api/crawl/arxiv/route.ts` (new) — GET handler that proxies search requests to arXiv API, parses Atom XML, returns normalized ArxivPaper objects
  - `workbench/src/app/api/crawl/arxiv/route.test.ts` (new) — 5 tests covering query validation, XML parsing, parameter forwarding, error handling, and ID extraction
- **Summary**: First backend API route for the Crawl section. Proxies queries to `export.arxiv.org/api/query` with sorting by submission date, parses Atom XML response using regex-based extraction, strips whitespace from title/summary, and extracts paper IDs from arXiv URLs. Returns `{ papers: ArxivPaper[] }` on success or `{ papers: [], error: string }` on failure.

---

## 2026-03-05 — Phase 4: Crawl Section — arXiv Cache Database

### Task: Create arXiv cache database table

- **Date**: 2026-03-05
- **Commit**: `5eceefe`
- **Files changed**:
  - `workbench/src/lib/crawl-db.ts` (new) — Database schema and CRUD operations for arxiv_cache table
  - `workbench/src/lib/crawl-db.test.ts` (new) — 10 tests covering create, get, getAll, delete, and expiration functions
  - `workbench/src/lib/db.ts` — Added initCrawlSchema() call to database initialization
- **Summary**: Created arxiv_cache table in SQLite with fields for query (text), results (JSON blob), result_count (integer), timestamp (integer), and created_at. Added indexes on query and timestamp for efficient lookups and cache expiration. Implemented full CRUD operations including deleteExpiredArxivCache() for timestamp-based cache invalidation.

---

## 2026-03-05 — Agent Pipeline Bug Fix: Worktree Git Safety

### Task: Investigate task-49 worktree failure

**Problem:** Task 49 (create arxiv_cache database schema) failed with "Merge produced no changes — agent may have failed to modify any files" even though the implementation was complete and correct.

**Root Cause Investigation:**
- The agent successfully created files in the worktree
- When the agent invoked `agent-commit` skill and ran `git status`, the output showed "On branch main" instead of the task branch
- The Skill tool changes the working directory when loading skills, and the first git command after skill load ran in the main repo instead of the worktree
- The commit was made directly to `main` instead of `task/create-arxiv-cache-database-schema`
- When the executor tried to merge, there were no new commits on the task branch

**Commit:** `2b2b7f6`

**Changes:**
- `~/.claude/skills/agent-commit/skill.md` — Added branch verification as first step, relative path instructions, and final branch check
- `~/.claude/skills/agent-reflection-after-work/skill.md` — Changed absolute paths to relative paths, added branch verification at multiple points
- `workbench/data/agent-working-claude.md` — Added "Git Safety in Worktrees" section with 4 safety rules: verify branch before commits, use relative paths for git ops, use relative paths for file edits, verify branch after loading skills

**Fix Strategy:**
1. Skills now require `git branch --show-current` verification before any commit operations
2. Skills use relative paths instead of hardcoded absolute paths
3. Agent instructions warn about Skill tool's directory-changing behavior


---

## 2026-03-05 — Phase 4: Crawl Section — Documentation Updates

### Task: Update crawl-section.md documentation

- **Date**: 2026-03-05
- **Commit**: `325f6ad`
- **Files changed**:
  - `workbench/docs/crawl-section.md` — Updated Overview to reflect arXiv panel is functional with API; updated ArxivPanel Behavior section to describe API endpoint, cache checking, and error handling; updated State comment; updated Content Sources table status; added new Cache Management section with TTL, eviction, and fallback details; updated Common Pitfalls to remove mock data warnings and add cache fallback note
- **Summary**: Documentation now accurately reflects the completed arXiv API implementation with caching. The ArxivPanel is described as "Functional with API + caching" rather than using mock data. Added comprehensive Cache Management section explaining the 5-minute TTL, deleteExpiredArxivCache() function, and stale cache fallback (206 status) behavior.

## 2026-03-05 — Phase 6: arXiv Panel Implementation

### Task 1: Create arXiv API Route

**Commit:** `c957288` (followed by fixes: `7bfe1da`, `681f8fc`, `f6159cb`)

**Problem:** ArxivPanel had mock data only; no real API integration.

**Changes:**
- `workbench/src/app/api/crawl/arxiv/route.ts` — Created GET handler with 5-minute caching,
  10s timeout, stale cache fallback (206 status). Uses `getArxivCache`/`createArxivCache`.
- `workbench/src/lib/arxiv-parser.ts` — XML parser with `parseArxivXml` function,
  extracts id, title, authors, summary, link using regex (due to Next.js constraint).

### Task 2: Update ArxivPanel to Use API Route

**Commit:** `645a788`

**Changes:**
- `workbench/src/app/crawl/page.tsx` — Replaced `fetchPapers` to call `/api/crawl/arxiv`
  endpoint, with proper error handling and alert on failure.

### Task 3: Add API Route Tests

**Commits:** `dd7ee54`, `ba2547a`

**Changes:**
- `workbench/src/app/api/crawl/arxiv/route.test.ts` — Created 5 tests: missing param,
  fresh cache, API fetch, stale cache on error, 500 error with no cache.
- Fixed issues: proper mock restoration, removed extra tests (cache refresh, timeout).

### Task 4: Add XML Parser Tests

**Commits:** `2b97a99`, `e3f50b8`

**Changes:**
- `workbench/src/lib/crawl-arxiv-parser.test.ts` — Created 5 parser unit tests.
- Fixed issues: removed extra tests, corrected whitespace test name for `.trim()` behavior.

### Task 5: Update crawl-section.md Documentation

**Commit:** `325f6ad`

**Changes:**
- `workbench/docs/crawl-section.md` — Updated Overview, ArxivPanel Behavior section,
  added Cache Management section describing 5-min TTL, eviction, fallback.

### Task 6: Update PROGRESS.md

**Commits:** `e34db7a`, `c0c38f0`

**Changes:**
- `workbench/PROGRESS.md` — Added Phase 6: Crawl Section with 4 completed
  arXiv items and 5 pending items for other panels. Updated status table.

### Task 7: Final Build Validation

**Summary:** All 10 arXiv-related tests pass (5 route, 5 parser). Build succeeds.
  3 pre-existing test failures unrelated to arXiv.

**Total commits:** 12 commits from `c957288` to `c0c38f0`.

---

## 2026-03-05 — Phase 6: arXiv Panel UI Fix

### Task: Fix arXiv panel height and add custom scrollbar

**Commit:** `29ef2b9`

**Problem:** When arXiv search returned many results, the panel grew in height instead of
staying fixed and using the scrollbar. This pushed other panels out of view.

**Changes:**
- `workbench/src/app/crawl/page.tsx` — Added `min-h-0` class to ArxivPanel container
  to prevent flex/grid child expansion. Added custom scrollbar CSS (6px width,
  rounded corners, hover effects) for better appearance in both light and dark modes.

**Fix Strategy:**
The root cause was CSS flex/grid behavior where `h-full` alone doesn't prevent child
expansion when content overflows. Adding `min-h-0` (Tailwind equivalent to `min-height: 0`)
allows the flex child to shrink below its content height, enabling the inner `overflow-y-auto`
to constrain content and show the scrollbar.
## 2026-03-05 — arXiv Panel Recent Search Enhancement

### Task 1: arXiv panel searches for most recent entries on mount

**Commit:** `54e0f39`

**Problem:** The arXiv panel required manual search and defaulted to cs.AI category only.
Recent papers were not automatically shown when the page loaded.

**Changes:**
- `workbench/src/app/api/crawl/arxiv/route.ts` — Added `sortBy=submittedDate&sortOrder=descending`
  to API URL to return papers sorted by submission date (most recent first).
- `workbench/src/app/crawl/page.tsx` — Changed default query from `cat:cs.AI` to `cat:cs.*`
  (all CS papers), added `useEffect` hook to auto-fetch on component mount, imported
  `useEffect` from React, updated placeholder text.

---

## 2026-03-05 — Test Database Isolation

### Task 1: Prevent tests from wiping production database

**Commits:** `6d23905`, `be426e9`, `49f926a`

**Problem:** Tests used `beforeEach()` hooks with `DELETE FROM` statements that operated
on the production database at `data/workbench.db`, wiping real data when running tests.

**Solution:** Modified `getDb()` to automatically detect test environment and use in-memory
SQLite database (`:memory:`), providing complete isolation between tests and production data.

**Changes:**
- `docs/plans/2026-03-05-test-database-isolation-design.md` — Created design document
  explaining the problem, solution approach (automatic environment detection), database
  lifecycle (shared in-memory database with `beforeEach()` cleanup), and edge cases.
- `docs/plans/2026-03-05-test-database-isolation.md` — Created implementation plan with
  step-by-step tasks for modifying `getDb()` and verification testing.
- `workbench/src/lib/db.ts` — Modified `getDb()` function (lines 21-23) to detect test
  environment via `process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'`
  and use `:memory:` database path instead of file path when in test mode. All other
  initialization logic unchanged.

**Verification:**
- All database tests pass (home-db: 12 tests, clipboard-db: 9 tests, crawl-db: 10 tests)
- Production database at `data/workbench.db` verified intact (4.1M, not modified during tests)
- Full test suite: 95/97 passing (2 pre-existing CSS failures unrelated to database work)

