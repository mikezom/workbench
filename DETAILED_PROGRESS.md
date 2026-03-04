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
