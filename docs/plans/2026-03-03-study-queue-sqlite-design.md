# Study Queue System + SQLite Migration

**Date:** 2026-03-03
**Status:** Approved

## Problem

The review session shows each card exactly once regardless of rating. Cards rated
"Again" should re-enter the session after a short delay. The system needs
day-based scheduling with capacity limits, and JSON file storage should be
replaced with SQLite for performance.

## Design Decisions

- **FSRS retained** for computing intervals (minutes). The queue system is a
  scheduling layer on top.
- **`scheduled_at` per card** is the single source of truth for when a card
  appears. No separate queue data structure — the database IS the queue.
- **SQLite via better-sqlite3** replaces all JSON file storage.
- **Intra-day re-queuing**: cards with intervals shorter than the time until next
  rollover stay in the session and reappear after a delay.
- **Unreviewed cards accumulate in place** (backlog behavior, like Anki).
- **Existing data migrated** from JSON files to SQLite on first run.

## Data Model

### Cards Table

| Column              | Type    | Notes                                    |
|---------------------|---------|------------------------------------------|
| id                  | TEXT PK | UUID                                     |
| front               | TEXT    | Legacy/Anki card front                   |
| back                | TEXT    | Legacy/Anki card back                    |
| title               | TEXT    | Structured card title                    |
| definition          | TEXT    | Structured card definition               |
| example             | TEXT    | Structured card example                  |
| source              | TEXT    | Optional forest reference                |
| group_id            | TEXT FK | Nullable                                 |
| scheduled_at        | TEXT    | ISO datetime — when card should appear   |
| fsrs_state          | INTEGER | 0=new, 1=learning, 2=review, 3=relearn  |
| fsrs_stability      | REAL    |                                          |
| fsrs_difficulty     | REAL    |                                          |
| fsrs_elapsed_days   | REAL    |                                          |
| fsrs_scheduled_days | REAL    |                                          |
| fsrs_reps           | INTEGER |                                          |
| fsrs_lapses         | INTEGER |                                          |
| fsrs_last_review    | TEXT    | ISO datetime                             |
| created_at          | TEXT    |                                          |
| updated_at          | TEXT    |                                          |

Index: `cards(group_id, scheduled_at)`

### Groups Table

| Column             | Type    | Notes                     |
|--------------------|---------|---------------------------|
| id                 | TEXT PK | UUID                      |
| name               | TEXT    |                           |
| parent_id          | TEXT FK | Nullable, self-ref        |
| daily_new_limit    | INTEGER | Default 20                |
| daily_review_limit | INTEGER | Default 100               |
| rollover_hour      | INTEGER | Default 5 (5 AM local)    |
| created_at         | TEXT    |                           |

### Study Log Table

| Column      | Type       | Notes               |
|-------------|------------|----------------------|
| id          | INTEGER PK | Auto-increment       |
| card_id     | TEXT FK    |                      |
| group_id    | TEXT FK    |                      |
| rating      | INTEGER    | 1–4                  |
| was_new     | INTEGER    | Boolean (0/1)        |
| reviewed_at | TEXT       | ISO datetime         |

Index: `study_log(group_id, reviewed_at)`

## Session Behavior

### Starting a Session

1. Compute "today's window": most recent rollover (5 AM) → next rollover.
2. Query cards where `scheduled_at <= now` for the selected group (includes
   backlog from previous days).
3. Separate into new (`fsrs_state = 0`) and review (`fsrs_state > 0`).
4. Check `study_log` for cards already studied today (since last rollover).
5. Apply remaining daily limits.
6. Combine: new cards first, then reviews.

### Rating a Card

1. User rates Again / Hard / Good / Easy.
2. API calls FSRS `f.next()` → computes new card state with `due` date.
3. Interval in minutes = `(new_due - now)`.
4. Update `scheduled_at = now + interval` and all `fsrs_*` columns.
5. Record to `study_log`.
6. Return the interval to the frontend.

### Intra-day Re-queuing

- If `scheduled_at < next_rollover`: card is "delayed" — stays in the session.
- If `scheduled_at >= next_rollover`: card is done for today.
- Frontend tracks delayed cards with `available_at` timestamps.
- After all immediate cards are shown:
  - Delayed cards now available → show them.
  - Still waiting → show countdown timer.
  - None remain → session complete.
- Session ends only when all cards are scheduled beyond the next rollover.

## New Card Distribution

When cards are added (manual or Anki import):

1. Compute the group's rollover-aligned day boundaries starting from now.
2. Count new cards (`fsrs_state = 0`) already scheduled per day-slot.
3. For each new card, find the earliest day-slot under `daily_new_limit`.
4. Set `scheduled_at` = that slot's rollover time.

Example: `daily_new_limit = 5`, importing 12 cards:
- Day 0 (today 5 AM): cards 1–5
- Day 1 (tomorrow 5 AM): cards 6–10
- Day 2: cards 11–12

## Migration

On first server start:

1. Check if `data/workbench.db` exists. If not, create it and run schema.
2. Check if `data/cards.json` exists.
3. Read `groups.json` → insert into `groups` table.
4. Read `cards.json` → insert into `cards` table, mapping `fsrs` object to flat
   columns, setting `scheduled_at` from `fsrs.due`.
5. Read `study_log.json` → insert into `study_log` table.
6. Rename JSON files to `.json.bak`.

## Tech Stack

- **better-sqlite3**: Synchronous, fast, zero-config for single-user app.
- **DB file**: `data/workbench.db`
- **Schema**: `CREATE TABLE IF NOT EXISTS` on first connection.
- **API layer**: `lib/db.ts` replaces `lib/cards.ts`, `lib/groups.ts`,
  `lib/study-log.ts`.
