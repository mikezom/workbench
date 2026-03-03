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
