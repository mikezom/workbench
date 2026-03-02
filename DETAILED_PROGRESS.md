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
