# Study Section — Technical Description

## Overview

The Study section is an FSRS-based spaced repetition flashcard system. It supports manual card creation, Anki `.apkg` import, hierarchical card groups with per-group daily limits, and a review session with immediate intra-day re-queuing. Storage is SQLite via `better-sqlite3`.

## Architecture

```
UI (study/page.tsx — single client component)
  ↓ fetch
API Routes (Next.js route handlers)
  ↓ call
DB Layer (src/lib/db.ts — SQLite + ts-fsrs)
  ↓ read/write
SQLite (data/workbench.db)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/study/page.tsx` | Entire Study UI — all sub-components in one file |
| `src/lib/db.ts` | SQLite schema, all DB operations, FSRS scheduling |
| `src/lib/anki-import.ts` | Parses `.apkg` files, renders Anki templates |
| `src/app/api/cards/route.ts` | `GET` list all, `POST` create card |
| `src/app/api/cards/[id]/route.ts` | `PUT` update, `DELETE` card |
| `src/app/api/cards/[id]/review/route.ts` | `POST` rate a card (triggers FSRS) |
| `src/app/api/cards/session/route.ts` | `GET` session cards with budget info |
| `src/app/api/groups/route.ts` | `GET` list all, `POST` create group |
| `src/app/api/groups/[id]/route.ts` | `PUT` update, `DELETE` cascade group |
| `src/app/api/study-log/route.ts` | `GET` today's study counts (standalone) |
| `src/app/api/import/anki/route.ts` | `POST` multipart Anki import |
| `src/app/api/migrate/route.ts` | `POST` one-time JSON→SQLite migration |

## Database Schema

SQLite at `data/workbench.db`. WAL mode, foreign keys ON.

### `groups`
```sql
id TEXT PRIMARY KEY,
name TEXT NOT NULL,
parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
daily_new_limit INTEGER DEFAULT 20,
daily_review_limit INTEGER DEFAULT 100,
rollover_hour INTEGER DEFAULT 5,
created_at TEXT
```

### `cards`
```sql
id TEXT PRIMARY KEY,
front TEXT NOT NULL DEFAULT '',    -- legacy (Anki HTML)
back TEXT NOT NULL DEFAULT '',     -- legacy (Anki HTML)
title TEXT,                        -- structured card model
definition TEXT,                   -- structured card model
example TEXT,                      -- structured card model (optional)
source TEXT,                       -- forester page ref (unused currently)
group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
scheduled_at TEXT NOT NULL,        -- when the card is next due
fsrs_state INTEGER DEFAULT 0,     -- 0=New, 1+=Learning/Review/Relearning
fsrs_stability REAL DEFAULT 0,
fsrs_difficulty REAL DEFAULT 0,
fsrs_elapsed_days REAL DEFAULT 0,
fsrs_scheduled_days REAL DEFAULT 0,
fsrs_reps INTEGER DEFAULT 0,
fsrs_lapses INTEGER DEFAULT 0,
fsrs_last_review TEXT,
created_at TEXT,
updated_at TEXT
```
Index: `idx_cards_group_scheduled ON cards(group_id, scheduled_at)`

### `study_log`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
rating INTEGER NOT NULL,           -- 1=Again, 2=Hard, 3=Good, 4=Easy
was_new INTEGER NOT NULL DEFAULT 0,-- 1 if card was state=0 at review time
reviewed_at TEXT NOT NULL
```
Index: `idx_study_log_group_date ON study_log(group_id, reviewed_at)`

## Dual Card Format

Cards have two rendering modes:

1. **Structured** (`title`/`definition`/`example`) — for manually created cards. Plain text rendering. The UI checks `card.title` to decide this mode.
2. **Legacy** (`front`/`back`) — for Anki imports. Rendered via `dangerouslySetInnerHTML` to support HTML/images. When creating cards manually, both formats are populated (`front = title`, `back = definition`).

## Day Rollover System

"Today" is not midnight-to-midnight. Each group has a `rollover_hour` (default 5 = 5:00 AM local time).

`getRolloverBoundary(rolloverHour)` returns:
- `current`: most recent past rollover (today at rolloverHour, or yesterday's if not yet reached)
- `next`: current + 24 hours

This affects:
- **Session budget**: cards reviewed since `current` count toward today's limits
- **New card scheduling**: `computeNewCardSlot` distributes new cards across future rollover-aligned days
- **Immediate re-queuing**: cards due before `next` rollover are re-queued in the same session

**Important:** Uses local time (via `setHours()`), NOT UTC. This was a past bug (see REFLECTION.md).

## Review Session Flow

### Pre-session
1. `fetchBudgetInfo` calls `GET /api/cards/session?group_id=...` to show new/review counts
2. UI displays: "N new cards, M review cards" with a Start Review button
3. If zero cards due: shows congratulations message, no Start button

### Starting a session
1. `startSession` calls `GET /api/cards/session?group_id=...`
2. Server computes due cards (`scheduled_at <= now`), splits into new vs review
3. Budget enforcement: `min(available, limit - studiedToday)` for each type
4. Returns `{ cards, nextRollover, budgetInfo }`
5. UI populates `immediateQueue` with returned cards

### Reviewing
1. Show front of `immediateQueue[0]` (title only for structured, front HTML for legacy)
2. User clicks "Show Answer" → reveal definition/example or back
3. User rates: Again (1), Hard (2), Good (3), Easy (4)
4. `POST /api/cards/{id}/review` with `{ rating }`
5. Server runs FSRS scheduling (`f.next(card, now, rating)`), updates card, logs to study_log
6. Returns `{ card, scheduledAt, intervalMinutes }`

### Immediate Re-queuing (Phase 3e)
After rating, if `scheduledAt < nextRollover`:
- Card is appended to the END of `immediateQueue` (will be seen again this session)

If `scheduledAt >= nextRollover`:
- Card is removed from the queue (due tomorrow or later)

This means "Again"-rated cards cycle back within the session without any delay or countdown.

### Budget Note
When `selectedGroupId` is null (All Cards view), NO budget is enforced — all due cards are returned. Budget only applies when a specific group is selected.

## Group Hierarchy

Groups form a tree via `parent_id`. Key operations:

- **`getDescendantIds(id)`** — BFS traversal, returns all IDs in subtree (including root). Used in session queries, budget counting, and cascade delete.
- **Budget counting** — `getGroupStudiedToday` counts study_log entries across ALL descendant groups, not just the parent.
- **Cascade delete** — `deleteGroupCascade` finds all descendants, then in one transaction deletes: study_log → cards → groups for all IDs.
- **Card filtering** — The UI's `getDescendantIds` (in-memory BFS on groups array) filters cards for the selected group and all children.

## New Card Slot Distribution

To avoid exceeding daily limits:

- **Single card** (`computeNewCardSlot`): iterates days from today's rollover, finds first day where new card count < dailyNewLimit. Looks up to 366 days ahead.
- **Bulk import** (`createCardsBulk`): pre-loads existing new card counts across 366 days into memory, uses an in-memory counter to assign slots without per-card DB queries. All inserts run in one transaction.

## Anki Import (`anki-import.ts`)

1. Extracts `.apkg` (ZIP) to temp dir
2. Opens embedded `collection.anki2` (SQLite) read-only
3. Parses models (note types with field names and templates) and decks
4. Creates ONE group per `.apkg` file (subdeck hierarchy not preserved)
5. For each card: renders Anki template with field substitution, conditional blocks, `{{FrontSide}}` replacement, `{{hint:field}}` support
6. Strips `[sound:...]` tags and HTML comments
7. Returns `{ groups: [{id, name}], cards: [{front, back, group_id}] }`
8. API route then creates groups in DB, remaps IDs, calls `createCardsBulk`

## UI Layout (`study/page.tsx`)

Single client component file containing all sub-components:

```
┌──────────────────────────────────────────────┐
│ Nav (48px, from root layout)                 │
├────────────┬─────────────────────────────────┤
│ Study      │                                 │
│ Sidebar    │  Main Panel (tab content)       │
│ (192px)    │                                 │
│            │  - ReviewTab                    │
│ [Review]   │  - CardsTab                     │
│ [Cards]    │  - SettingsTab                  │
│ [Settings] │                                 │
│            │                                 │
│ ─────────  │                                 │
│ Groups:    │                                 │
│  All Cards │                                 │
│  Group A   │                                 │
│    Sub A1  │                                 │
│  Group B   │                                 │
└────────────┴─────────────────────────────────┘
```

- **Sidebar** — tab buttons (Review/Cards/Settings) + group tree below. Scroll-independent from main panel.
- **GroupTree** — shows all groups with indentation; card count per group (including descendants). "All Cards" option at top.
- **ReviewTab** — pre-session info → session → completion. Progress display (remaining + reviewed) at bottom-right.
- **CardsTab** — list cards for selected group, add/edit/delete, Anki import button.
- **CardForm** — title, definition, example fields + group selector with tree-indented options.
- **SettingsTab** — group CRUD. GroupSettingsEditor: name, daily new limit, daily review limit, rollover hour.

## API Reference

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/cards` | List all cards |
| POST | `/api/cards` | Create card |
| PUT | `/api/cards/:id` | Update card |
| DELETE | `/api/cards/:id` | Delete card |
| POST | `/api/cards/:id/review` | Rate card (FSRS scheduling) |
| GET | `/api/cards/session?group_id=` | Get session cards + budget |
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:id` | Update group name/settings |
| DELETE | `/api/groups/:id` | Cascade delete group + descendants |
| GET | `/api/study-log?group_id=` | Today's study counts |
| POST | `/api/import/anki` | Import .apkg file |
| POST | `/api/migrate` | One-time JSON→SQLite migration |

## Common Pitfalls

- **Rollover uses local time**, not UTC. `getRolloverBoundary` uses `setHours()`.
- **Descendant groups matter** for budget counting. `getGroupStudiedToday` queries across all descendants, not just the parent group.
- **Review is transactional** — the card UPDATE and study_log INSERT are wrapped in `db.transaction()`.
- **No budget in All Cards view** — when group_id is null, all due cards are returned with no limit.
- **No single-card GET endpoint** — `getCard(id)` exists in db.ts but is not exposed via API.
- **Migration is idempotent** — safe to call multiple times; no-ops after first successful run.
