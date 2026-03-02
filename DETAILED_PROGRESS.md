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
