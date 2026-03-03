# Study Queue System + SQLite Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace JSON file storage with SQLite, add per-card `scheduled_at` scheduling, and implement intra-day re-queuing so cards rated "Again" reappear within the same session.

**Architecture:** SQLite (better-sqlite3, already installed) replaces all three JSON files. A single `lib/db.ts` module owns the connection and all queries. FSRS computes intervals; the `scheduled_at` column is the scheduling source of truth. The frontend ReviewTab manages an intra-day delayed queue with a countdown timer.

**Tech Stack:** Next.js 14, better-sqlite3, ts-fsrs, React (client components)

---

## Task 1: SQLite Database Foundation

**Files:**
- Create: `workbench/src/lib/db.ts`

**Step 1: Create `lib/db.ts` with schema, singleton connection, and migration**

```typescript
import Database from "better-sqlite3";
import path from "path";
import { promises as fs } from "fs";

const DB_PATH = path.join(process.cwd(), "data", "workbench.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      daily_new_limit INTEGER NOT NULL DEFAULT 20,
      daily_review_limit INTEGER NOT NULL DEFAULT 100,
      rollover_hour INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      front TEXT NOT NULL DEFAULT '',
      back TEXT NOT NULL DEFAULT '',
      title TEXT,
      definition TEXT,
      example TEXT,
      source TEXT,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      scheduled_at TEXT NOT NULL,
      fsrs_state INTEGER NOT NULL DEFAULT 0,
      fsrs_stability REAL NOT NULL DEFAULT 0,
      fsrs_difficulty REAL NOT NULL DEFAULT 0,
      fsrs_elapsed_days REAL NOT NULL DEFAULT 0,
      fsrs_scheduled_days REAL NOT NULL DEFAULT 0,
      fsrs_reps INTEGER NOT NULL DEFAULT 0,
      fsrs_lapses INTEGER NOT NULL DEFAULT 0,
      fsrs_last_review TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_group_scheduled
      ON cards(group_id, scheduled_at);

    CREATE TABLE IF NOT EXISTS study_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      was_new INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_study_log_group_date
      ON study_log(group_id, reviewed_at);
  `);
}
```

**Step 2: Add migration function to `lib/db.ts`**

Appended to the same file. Reads JSON files, inserts into SQLite, renames to `.bak`.

```typescript
export async function migrateFromJson(): Promise<{ migrated: boolean; groups: number; cards: number }> {
  const db = getDb();
  const dataDir = path.join(process.cwd(), "data");
  const groupsPath = path.join(dataDir, "groups.json");

  // Check if JSON files exist
  try {
    await fs.access(groupsPath);
  } catch {
    return { migrated: false, groups: 0, cards: 0 };
  }

  // Skip if already migrated (groups table has data)
  const count = db.prepare("SELECT COUNT(*) as c FROM groups").get() as { c: number };
  if (count.c > 0) return { migrated: false, groups: 0, cards: 0 };

  const groupsRaw = JSON.parse(await fs.readFile(groupsPath, "utf-8"));
  const cardsPath = path.join(dataDir, "cards.json");
  const cardsRaw = JSON.parse(await fs.readFile(cardsPath, "utf-8"));

  const insertGroup = db.prepare(`
    INSERT INTO groups (id, name, parent_id, daily_new_limit, daily_review_limit, rollover_hour, created_at)
    VALUES (?, ?, ?, ?, ?, 5, ?)
  `);

  const insertCard = db.prepare(`
    INSERT INTO cards (id, front, back, title, definition, example, source, group_id, scheduled_at,
      fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days,
      fsrs_reps, fsrs_lapses, fsrs_last_review, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const migrate = db.transaction(() => {
    for (const g of groupsRaw) {
      insertGroup.run(g.id, g.name, g.parent_id, g.settings.dailyNewLimit, g.settings.dailyReviewLimit, g.created_at);
    }
    for (const c of cardsRaw) {
      insertCard.run(
        c.id, c.front, c.back, c.title ?? null, c.definition ?? null, c.example ?? null,
        c.source, c.group_id, c.fsrs.due,
        c.fsrs.state, c.fsrs.stability, c.fsrs.difficulty, c.fsrs.elapsed_days,
        c.fsrs.scheduled_days, c.fsrs.reps, c.fsrs.lapses, c.fsrs.last_review ?? null,
        c.created_at, c.updated_at
      );
    }
  });

  migrate();

  // Rename JSON files to .bak
  await fs.rename(groupsPath, groupsPath + ".bak");
  await fs.rename(cardsPath, cardsPath + ".bak");
  try {
    const logPath = path.join(dataDir, "study_log.json");
    await fs.rename(logPath, logPath + ".bak");
  } catch { /* no study log file, fine */ }

  return { migrated: true, groups: groupsRaw.length, cards: cardsRaw.length };
}
```

**Step 3: Add a migration API endpoint**

Create `workbench/src/app/api/migrate/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { migrateFromJson } from "@/lib/db";

export async function POST() {
  const result = await migrateFromJson();
  return NextResponse.json(result);
}
```

**Step 4: Verify migration works**

Run: `curl -X POST http://localhost:5090/api/migrate`
Expected: `{"migrated":true,"groups":2,"cards":...}` first time, `{"migrated":false,...}` subsequent times.
Check: `data/workbench.db` exists, `data/cards.json.bak` exists.

**Step 5: Commit**

```bash
git add workbench/src/lib/db.ts workbench/src/app/api/migrate/route.ts
git commit -m "feat: add SQLite database layer with schema and JSON migration"
```

---

## Task 2: Groups DB Layer + API Routes

**Files:**
- Modify: `workbench/src/lib/db.ts` (add group query functions)
- Modify: `workbench/src/app/api/groups/route.ts`
- Modify: `workbench/src/app/api/groups/[id]/route.ts`

**Step 1: Add group functions to `lib/db.ts`**

```typescript
// --- Group types ---

export interface DbGroup {
  id: string;
  name: string;
  parent_id: string | null;
  daily_new_limit: number;
  daily_review_limit: number;
  rollover_hour: number;
  created_at: string;
}

// Serialized shape matching the existing frontend interface
export interface GroupJson {
  id: string;
  name: string;
  parent_id: string | null;
  settings: { dailyNewLimit: number; dailyReviewLimit: number; rolloverHour: number };
  created_at: string;
}

function toGroupJson(row: DbGroup): GroupJson {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id,
    settings: {
      dailyNewLimit: row.daily_new_limit,
      dailyReviewLimit: row.daily_review_limit,
      rolloverHour: row.rollover_hour,
    },
    created_at: row.created_at,
  };
}

// --- Group queries ---

export function getAllGroups(): GroupJson[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM groups ORDER BY created_at").all() as DbGroup[];
  return rows.map(toGroupJson);
}

export function getGroup(id: string): GroupJson | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as DbGroup | undefined;
  return row ? toGroupJson(row) : undefined;
}

export function createGroup(
  name: string,
  parentId: string | null,
  settings?: { dailyNewLimit?: number; dailyReviewLimit?: number; rolloverHour?: number }
): GroupJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO groups (id, name, parent_id, daily_new_limit, daily_review_limit, rollover_hour, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, parentId, settings?.dailyNewLimit ?? 20, settings?.dailyReviewLimit ?? 100, settings?.rolloverHour ?? 5, now);
  return getGroup(id)!;
}

export function updateGroup(
  id: string,
  updates: { name?: string; settings?: { dailyNewLimit?: number; dailyReviewLimit?: number; rolloverHour?: number } }
): GroupJson | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM groups WHERE id = ?").get(id) as DbGroup | undefined;
  if (!existing) return null;
  const newName = updates.name ?? existing.name;
  const newLimit = updates.settings?.dailyNewLimit ?? existing.daily_new_limit;
  const newReviewLimit = updates.settings?.dailyReviewLimit ?? existing.daily_review_limit;
  const newRollover = updates.settings?.rolloverHour ?? existing.rollover_hour;
  db.prepare(`
    UPDATE groups SET name = ?, daily_new_limit = ?, daily_review_limit = ?, rollover_hour = ? WHERE id = ?
  `).run(newName, newLimit, newReviewLimit, newRollover, id);
  return getGroup(id)!;
}

export function getDescendantIds(id: string): string[] {
  const db = getDb();
  const all = db.prepare("SELECT id, parent_id FROM groups").all() as Array<{ id: string; parent_id: string | null }>;
  const result: string[] = [id];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const g of all) {
      if (g.parent_id === current && !result.includes(g.id)) {
        result.push(g.id);
        queue.push(g.id);
      }
    }
  }
  return result;
}

export function deleteGroupCascade(id: string): { deleted: boolean; cardsDeleted: number } {
  const db = getDb();
  const ids = getDescendantIds(id);
  const placeholders = ids.map(() => "?").join(",");

  // Count cards that will be deleted
  const countResult = db.prepare(
    `SELECT COUNT(*) as c FROM cards WHERE group_id IN (${placeholders})`
  ).get(...ids) as { c: number };

  const del = db.transaction(() => {
    // study_log entries cascade via FK on card_id and group_id
    db.prepare(`DELETE FROM study_log WHERE group_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM cards WHERE group_id IN (${placeholders})`).run(...ids);
    const result = db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).run(...ids);
    return result.changes > 0;
  });

  const deleted = del();
  return { deleted, cardsDeleted: countResult.c };
}
```

**Step 2: Update `api/groups/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAllGroups, createGroup } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllGroups());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, parent_id, settings } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const group = createGroup(name.trim(), parent_id ?? null, settings);
  return NextResponse.json(group, { status: 201 });
}
```

**Step 3: Update `api/groups/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateGroup, deleteGroupCascade } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { name, settings } = body;
  const group = updateGroup(params.id, { name, settings });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json(group);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { deleted, cardsDeleted } = deleteGroupCascade(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, cardsDeleted });
}
```

**Step 4: Verify groups API works**

Run migration first if not done: `curl -X POST http://localhost:5090/api/migrate`
Then: `curl http://localhost:5090/api/groups`
Expected: JSON array of groups with `settings.rolloverHour` field.

**Step 5: Commit**

```bash
git add workbench/src/lib/db.ts workbench/src/app/api/groups/route.ts workbench/src/app/api/groups/\[id\]/route.ts
git commit -m "feat: replace groups JSON storage with SQLite queries"
```

---

## Task 3: Cards DB Layer + API Routes + New Card Distribution

**Files:**
- Modify: `workbench/src/lib/db.ts` (add card query functions)
- Modify: `workbench/src/app/api/cards/route.ts`
- Modify: `workbench/src/app/api/cards/[id]/route.ts`

**Step 1: Add card types and helper to `lib/db.ts`**

```typescript
// --- Card types ---

export interface DbCard {
  id: string;
  front: string;
  back: string;
  title: string | null;
  definition: string | null;
  example: string | null;
  source: string | null;
  group_id: string | null;
  scheduled_at: string;
  fsrs_state: number;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_last_review: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardJson {
  id: string;
  front: string;
  back: string;
  title: string | null;
  definition: string | null;
  example: string | null;
  source: string | null;
  group_id: string | null;
  scheduled_at: string;
  fsrs: {
    due: string;
    state: number;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    last_review: string | null;
  };
  created_at: string;
  updated_at: string;
}

function toCardJson(row: DbCard): CardJson {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    title: row.title,
    definition: row.definition,
    example: row.example,
    source: row.source,
    group_id: row.group_id,
    scheduled_at: row.scheduled_at,
    fsrs: {
      due: row.scheduled_at,
      state: row.fsrs_state,
      stability: row.fsrs_stability,
      difficulty: row.fsrs_difficulty,
      elapsed_days: row.fsrs_elapsed_days,
      scheduled_days: row.fsrs_scheduled_days,
      reps: row.fsrs_reps,
      lapses: row.fsrs_lapses,
      last_review: row.fsrs_last_review,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Compute the most recent rollover boundary (e.g., today at 5 AM or yesterday at 5 AM). */
export function getRolloverBoundary(rolloverHour: number, now: Date = new Date()): { current: Date; next: Date } {
  const current = new Date(now);
  current.setHours(rolloverHour, 0, 0, 0);
  if (now < current) {
    current.setDate(current.getDate() - 1);
  }
  const next = new Date(current);
  next.setDate(next.getDate() + 1);
  return { current, next };
}
```

**Step 2: Add card CRUD functions to `lib/db.ts`**

```typescript
export function getAllCards(): CardJson[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM cards ORDER BY created_at").all() as DbCard[];
  return rows.map(toCardJson);
}

export function getCard(id: string): CardJson | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as DbCard | undefined;
  return row ? toCardJson(row) : undefined;
}

export function createCard(
  data: {
    front: string;
    back: string;
    group_id: string | null;
    title?: string;
    definition?: string;
    example?: string;
  }
): CardJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  // Determine scheduled_at via new card distribution
  let scheduledAt = nowIso;
  if (data.group_id) {
    scheduledAt = computeNewCardSlot(db, data.group_id, now);
  }

  db.prepare(`
    INSERT INTO cards (id, front, back, title, definition, example, source, group_id, scheduled_at,
      fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days,
      fsrs_reps, fsrs_lapses, fsrs_last_review, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)
  `).run(id, data.front, data.back, data.title ?? null, data.definition ?? null,
    data.example ?? null, data.group_id, scheduledAt, nowIso, nowIso);

  return getCard(id)!;
}

export function updateCard(
  id: string,
  updates: { front?: string; back?: string; group_id?: string | null; title?: string; definition?: string; example?: string }
): CardJson | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as DbCard | undefined;
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cards SET front = ?, back = ?, title = ?, definition = ?, example = ?, group_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.front ?? existing.front,
    updates.back ?? existing.back,
    updates.title !== undefined ? updates.title : existing.title,
    updates.definition !== undefined ? updates.definition : existing.definition,
    updates.example !== undefined ? updates.example : existing.example,
    updates.group_id !== undefined ? updates.group_id : existing.group_id,
    now, id
  );
  return getCard(id)!;
}

export function deleteCard(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  return result.changes > 0;
}
```

**Step 3: Add new card distribution function to `lib/db.ts`**

```typescript
/**
 * Find the earliest day-slot with capacity for a new card.
 * Returns an ISO string for scheduled_at.
 */
function computeNewCardSlot(db: Database.Database, groupId: string, now: Date): string {
  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId) as DbGroup | undefined;
  const rolloverHour = group?.rollover_hour ?? 5;
  const dailyNewLimit = group?.daily_new_limit ?? 20;

  const { current: todayRollover } = getRolloverBoundary(rolloverHour, now);

  for (let day = 0; day < 365; day++) {
    const slotStart = new Date(todayRollover);
    slotStart.setDate(slotStart.getDate() + day);
    const slotEnd = new Date(slotStart);
    slotEnd.setDate(slotEnd.getDate() + 1);

    const count = db.prepare(`
      SELECT COUNT(*) as c FROM cards
      WHERE group_id = ? AND fsrs_state = 0
        AND scheduled_at >= ? AND scheduled_at < ?
    `).get(groupId, slotStart.toISOString(), slotEnd.toISOString()) as { c: number };

    if (count.c < dailyNewLimit) {
      return slotStart.toISOString();
    }
  }

  // Fallback: schedule 365 days out
  const far = new Date(todayRollover);
  far.setDate(far.getDate() + 365);
  return far.toISOString();
}
```

**Step 4: Add bulk create for Anki import**

```typescript
export function createCardsBulk(
  cards: Array<{ front: string; back: string; group_id: string | null; title?: string; definition?: string; example?: string }>
): CardJson[] {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // Pre-compute slots per group to avoid re-querying per card
  const groupSlotCounters = new Map<string, { rolloverHour: number; dailyNewLimit: number; todayRollover: Date; dayCounts: Map<number, number> }>();

  function getSlotForGroup(groupId: string): string {
    if (!groupSlotCounters.has(groupId)) {
      const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId) as DbGroup | undefined;
      const rolloverHour = group?.rollover_hour ?? 5;
      const dailyNewLimit = group?.daily_new_limit ?? 20;
      const { current: todayRollover } = getRolloverBoundary(rolloverHour, now);

      // Load existing new-card counts per day
      const dayCounts = new Map<number, number>();
      const rows = db.prepare(`
        SELECT scheduled_at FROM cards WHERE group_id = ? AND fsrs_state = 0
      `).all(groupId) as Array<{ scheduled_at: string }>;

      for (const row of rows) {
        const d = new Date(row.scheduled_at);
        const dayNum = Math.floor((d.getTime() - todayRollover.getTime()) / (24 * 60 * 60 * 1000));
        dayCounts.set(dayNum, (dayCounts.get(dayNum) ?? 0) + 1);
      }

      groupSlotCounters.set(groupId, { rolloverHour, dailyNewLimit, todayRollover, dayCounts });
    }

    const info = groupSlotCounters.get(groupId)!;
    for (let day = 0; day < 3650; day++) {
      const count = info.dayCounts.get(day) ?? 0;
      if (count < info.dailyNewLimit) {
        info.dayCounts.set(day, count + 1);
        const slot = new Date(info.todayRollover);
        slot.setDate(slot.getDate() + day);
        return slot.toISOString();
      }
    }

    const far = new Date(info.todayRollover);
    far.setDate(far.getDate() + 3650);
    return far.toISOString();
  }

  const insert = db.prepare(`
    INSERT INTO cards (id, front, back, title, definition, example, source, group_id, scheduled_at,
      fsrs_state, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days,
      fsrs_reps, fsrs_lapses, fsrs_last_review, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, 0, 0, 0, 0, 0, NULL, ?, ?)
  `);

  const ids: string[] = [];
  const insertAll = db.transaction(() => {
    for (const c of cards) {
      const id = crypto.randomUUID();
      const scheduledAt = c.group_id ? getSlotForGroup(c.group_id) : nowIso;
      insert.run(id, c.front, c.back, c.title ?? null, c.definition ?? null,
        c.example ?? null, c.group_id, scheduledAt, nowIso, nowIso);
      ids.push(id);
    }
  });

  insertAll();
  return ids.map((id) => getCard(id)!);
}
```

**Step 5: Update `api/cards/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAllCards, createCard } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllCards());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { front, back, group_id, title, definition, example } = body;
  const cardFront = front?.trim() || title?.trim() || "";
  const cardBack = back?.trim() || definition?.trim() || "";
  if (!cardFront || !cardBack) {
    return NextResponse.json({ error: "front/back or title/definition are required" }, { status: 400 });
  }
  const card = createCard({ front: cardFront, back: cardBack, group_id: group_id ?? null, title, definition, example });
  return NextResponse.json(card, { status: 201 });
}
```

**Step 6: Update `api/cards/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateCard, deleteCard } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { front, back, group_id, title, definition, example } = body;
  const card = updateCard(params.id, { front, back, group_id, title, definition, example });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json(card);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = deleteCard(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

**Step 7: Verify cards API**

Run: `curl http://localhost:5090/api/cards | head -c 500`
Expected: JSON array with `scheduled_at` and `fsrs` fields.
Run: `curl -X POST http://localhost:5090/api/cards -H 'Content-Type: application/json' -d '{"title":"Test","definition":"Test def","group_id":"2cea022c-b5a7-4fc6-9867-4fccca28b03c"}'`
Expected: Card created with `scheduled_at` set based on distribution.

**Step 8: Commit**

```bash
git add workbench/src/lib/db.ts workbench/src/app/api/cards/route.ts workbench/src/app/api/cards/\[id\]/route.ts
git commit -m "feat: replace cards JSON storage with SQLite, add new card distribution"
```

---

## Task 4: Study Log + Review API

**Files:**
- Modify: `workbench/src/lib/db.ts` (add study log + review functions)
- Modify: `workbench/src/app/api/cards/[id]/review/route.ts`
- Modify: `workbench/src/app/api/study-log/route.ts`

**Step 1: Add study log and review functions to `lib/db.ts`**

```typescript
import { fsrs, Rating, type Grade, type Card as FSRSCard } from "ts-fsrs";

const f = fsrs();

// --- Study log ---

export function getGroupStudiedToday(groupId: string): { new: number; review: number } {
  const db = getDb();
  const group = db.prepare("SELECT rollover_hour FROM groups WHERE id = ?").get(groupId) as { rollover_hour: number } | undefined;
  const rolloverHour = group?.rollover_hour ?? 5;
  const { current } = getRolloverBoundary(rolloverHour);

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN was_new = 1 THEN 1 ELSE 0 END), 0) as new_count,
      COALESCE(SUM(CASE WHEN was_new = 0 THEN 1 ELSE 0 END), 0) as review_count
    FROM study_log
    WHERE group_id = ? AND reviewed_at >= ?
  `).get(groupId, current.toISOString()) as { new_count: number; review_count: number };

  return { new: row.new_count, review: row.review_count };
}

function recordStudy(db: Database.Database, cardId: string, groupId: string, rating: number, wasNew: boolean) {
  db.prepare(`
    INSERT INTO study_log (card_id, group_id, rating, was_new, reviewed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(cardId, groupId, rating, wasNew ? 1 : 0, new Date().toISOString());
}

// --- Review ---

export interface ReviewResult {
  card: CardJson;
  scheduledAt: string;
  intervalMinutes: number;
}

export function reviewCard(cardId: string, rating: Rating): ReviewResult | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as DbCard | undefined;
  if (!row) return null;

  const wasNew = row.fsrs_state === 0;
  const now = new Date();

  // Build FSRS card object with Date types
  const fsrsCard: FSRSCard = {
    due: new Date(row.scheduled_at),
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
    elapsed_days: row.fsrs_elapsed_days,
    scheduled_days: row.fsrs_scheduled_days,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    state: row.fsrs_state,
    last_review: row.fsrs_last_review ? new Date(row.fsrs_last_review) : undefined,
  };

  const result = f.next(fsrsCard, now, rating as Grade);
  const newDue = result.card.due as Date;
  const intervalMinutes = Math.round((newDue.getTime() - now.getTime()) / 60000);
  const scheduledAt = newDue.toISOString();

  // Update card in DB
  db.prepare(`
    UPDATE cards SET
      scheduled_at = ?,
      fsrs_state = ?, fsrs_stability = ?, fsrs_difficulty = ?,
      fsrs_elapsed_days = ?, fsrs_scheduled_days = ?,
      fsrs_reps = ?, fsrs_lapses = ?, fsrs_last_review = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    scheduledAt,
    result.card.state, result.card.stability, result.card.difficulty,
    result.card.elapsed_days, result.card.scheduled_days,
    result.card.reps, result.card.lapses,
    result.card.last_review ? (result.card.last_review as Date).toISOString() : null,
    now.toISOString(), cardId
  );

  // Record study log
  if (row.group_id) {
    recordStudy(db, cardId, row.group_id, rating, wasNew);
  }

  return {
    card: getCard(cardId)!,
    scheduledAt,
    intervalMinutes,
  };
}
```

**Step 2: Update `api/cards/[id]/review/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Rating } from "ts-fsrs";
import { reviewCard } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const rating = body.rating as Rating;
  if (![Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(rating)) {
    return NextResponse.json({ error: "rating must be 1-4" }, { status: 400 });
  }

  const result = reviewCard(params.id, rating);
  if (!result) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
```

**Step 3: Update `api/study-log/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getGroupStudiedToday } from "@/lib/db";

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("group_id");
  if (!groupId) {
    return NextResponse.json({ error: "group_id required" }, { status: 400 });
  }
  const log = getGroupStudiedToday(groupId);
  return NextResponse.json(log);
}
```

**Step 4: Verify review works**

Get a card ID from: `curl http://localhost:5090/api/cards | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"`
Then: `curl -X POST http://localhost:5090/api/cards/<id>/review -H 'Content-Type: application/json' -d '{"rating":1}'`
Expected: Response contains `card`, `scheduledAt`, and `intervalMinutes` fields. `intervalMinutes` should be small (1-10 min for Again).

**Step 5: Commit**

```bash
git add workbench/src/lib/db.ts workbench/src/app/api/cards/\[id\]/review/route.ts workbench/src/app/api/study-log/route.ts
git commit -m "feat: add review with interval tracking and study log in SQLite"
```

---

## Task 5: Session API Endpoint

**Files:**
- Create: `workbench/src/app/api/cards/session/route.ts`
- Modify: `workbench/src/lib/db.ts` (add session query)

**Step 1: Add session query function to `lib/db.ts`**

```typescript
export interface SessionResponse {
  cards: CardJson[];
  nextRollover: string;
  budgetInfo: {
    newUsed: number;
    newLimit: number;
    reviewUsed: number;
    reviewLimit: number;
    newAvailable: number;
    reviewAvailable: number;
  };
}

export function getSessionCards(groupId: string | null): SessionResponse {
  const db = getDb();
  const now = new Date();

  // Determine rollover hour and limits
  let rolloverHour = 5;
  let dailyNewLimit = 20;
  let dailyReviewLimit = 100;

  if (groupId) {
    const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId) as DbGroup | undefined;
    if (group) {
      rolloverHour = group.rollover_hour;
      dailyNewLimit = group.daily_new_limit;
      dailyReviewLimit = group.daily_review_limit;
    }
  }

  const { current: rolloverStart, next: nextRollover } = getRolloverBoundary(rolloverHour, now);

  // Get due cards for group (including descendants)
  let dueCards: DbCard[];
  if (groupId) {
    const descendantIds = getDescendantIds(groupId);
    const placeholders = descendantIds.map(() => "?").join(",");
    dueCards = db.prepare(`
      SELECT * FROM cards
      WHERE group_id IN (${placeholders}) AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
    `).all(...descendantIds, now.toISOString()) as DbCard[];
  } else {
    dueCards = db.prepare(`
      SELECT * FROM cards WHERE scheduled_at <= ? ORDER BY scheduled_at ASC
    `).all(now.toISOString()) as DbCard[];
  }

  const newCards = dueCards.filter((c) => c.fsrs_state === 0);
  const reviewCards = dueCards.filter((c) => c.fsrs_state > 0);

  // Check study log for today
  let log = { new: 0, review: 0 };
  if (groupId) {
    log = getGroupStudiedToday(groupId);
  }

  const newRemaining = Math.max(0, dailyNewLimit - log.new);
  const reviewRemaining = Math.max(0, dailyReviewLimit - log.review);

  const limitedNew = newCards.slice(0, newRemaining);
  const limitedReview = reviewCards.slice(0, reviewRemaining);

  return {
    cards: [...limitedNew, ...limitedReview].map(toCardJson),
    nextRollover: nextRollover.toISOString(),
    budgetInfo: {
      newUsed: log.new,
      newLimit: dailyNewLimit,
      reviewUsed: log.review,
      reviewLimit: dailyReviewLimit,
      newAvailable: limitedNew.length,
      reviewAvailable: limitedReview.length,
    },
  };
}
```

**Step 2: Create `api/cards/session/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionCards } from "@/lib/db";

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("group_id");
  const result = getSessionCards(groupId);
  return NextResponse.json(result);
}
```

**Step 3: Verify**

Run: `curl 'http://localhost:5090/api/cards/session?group_id=2cea022c-b5a7-4fc6-9867-4fccca28b03c'`
Expected: JSON with `cards` array, `nextRollover` string, and `budgetInfo` object.

**Step 4: Commit**

```bash
git add workbench/src/lib/db.ts workbench/src/app/api/cards/session/route.ts
git commit -m "feat: add session endpoint with rollover-aware card serving"
```

---

## Task 6: Anki Import Update

**Files:**
- Modify: `workbench/src/app/api/import/anki/route.ts`

**Step 1: Rewrite to use DB functions**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { parseApkg } from "@/lib/anki-import";
import { createCardsBulk, createGroup } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const maxNotes = parseInt(formData.get("maxNotes") as string) || 0;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseApkg(buffer, maxNotes);

    // Create groups via DB
    const createdGroups = result.groups.map((g) =>
      createGroup(g.name, g.parent_id)
    );

    // Map old group IDs from parser to new DB group IDs
    const groupIdMap = new Map<string, string>();
    for (let i = 0; i < result.groups.length; i++) {
      groupIdMap.set(result.groups[i].id, createdGroups[i].id);
    }

    // Create cards with remapped group IDs — bulk create handles distribution
    const created = createCardsBulk(
      result.cards.map((c) => ({
        front: c.front,
        back: c.back,
        group_id: groupIdMap.get(c.group_id) ?? null,
      }))
    );

    return NextResponse.json({
      groupsCreated: createdGroups.length,
      cardsCreated: created.length,
      groups: createdGroups.map((g) => ({ id: g.id, name: g.name })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Verify**

Test with the Anki import UI in the browser — import a small .apkg file. Cards should be created with `scheduled_at` values distributed across days.

**Step 3: Commit**

```bash
git add workbench/src/app/api/import/anki/route.ts
git commit -m "feat: update Anki import to use SQLite with card distribution"
```

---

## Task 7: ReviewTab Rewrite — Intra-day Re-queuing

**Files:**
- Modify: `workbench/src/app/study/page.tsx` (rewrite ReviewTab component)

This is the largest change. The ReviewTab needs to:
1. Fetch session cards from the new `/api/cards/session` endpoint
2. Track delayed cards (rated but coming back within today)
3. Show a countdown timer when waiting for delayed cards
4. End the session only when all cards are scheduled beyond nextRollover

**Step 1: Rewrite ReviewTab**

Replace the entire `ReviewTab` function in `page.tsx` with:

```tsx
function ReviewTab({
  cards,
  groups,
  selectedGroupId,
  onUpdate,
}: {
  cards: StudyCard[];
  groups: Group[];
  selectedGroupId: string | null;
  onUpdate: () => Promise<void>;
}) {
  const [immediateQueue, setImmediateQueue] = useState<StudyCard[]>([]);
  const [delayedCards, setDelayedCards] = useState<Array<{ card: StudyCard; availableAt: Date }>>([]);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [nextRollover, setNextRollover] = useState<Date | null>(null);
  const [budgetInfo, setBudgetInfo] = useState<{
    newUsed: number;
    newLimit: number;
    reviewUsed: number;
    reviewLimit: number;
    newAvailable: number;
    reviewAvailable: number;
  } | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const card = immediateQueue[0] ?? null;
  const isWaiting = !card && delayedCards.length > 0;
  const isComplete = sessionStarted && !card && delayedCards.length === 0;

  // Check delayed cards and promote available ones
  const promoteDelayed = useCallback(() => {
    const now = new Date();
    const ready: StudyCard[] = [];
    const stillWaiting: Array<{ card: StudyCard; availableAt: Date }> = [];

    for (const d of delayedCards) {
      if (d.availableAt <= now) {
        ready.push(d.card);
      } else {
        stillWaiting.push(d);
      }
    }

    if (ready.length > 0) {
      setImmediateQueue((prev) => [...prev, ...ready]);
      setDelayedCards(stillWaiting);
      setRevealed(false);
    }

    // Update countdown
    if (stillWaiting.length > 0 && ready.length === 0) {
      const earliest = stillWaiting.reduce((a, b) => (a.availableAt < b.availableAt ? a : b));
      const diff = Math.max(0, Math.ceil((earliest.availableAt.getTime() - now.getTime()) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    } else {
      setCountdown(null);
    }
  }, [delayedCards]);

  // Timer for checking delayed cards
  useEffect(() => {
    if (isWaiting) {
      timerRef.current = setInterval(promoteDelayed, 1000);
      promoteDelayed(); // check immediately
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWaiting, promoteDelayed]);

  const startSession = useCallback(async () => {
    const params = selectedGroupId ? `?group_id=${encodeURIComponent(selectedGroupId)}` : "";
    const res = await fetch(`/api/cards/session${params}`);
    if (!res.ok) return;
    const data = await res.json();

    setNextRollover(new Date(data.nextRollover));
    setBudgetInfo(data.budgetInfo);
    setImmediateQueue(data.cards);
    setDelayedCards([]);
    setRevealed(false);
    setSessionStarted(true);
    setTotalReviewed(0);
    setCountdown(null);
  }, [selectedGroupId]);

  // Reset when group changes
  useEffect(() => {
    setSessionStarted(false);
    setImmediateQueue([]);
    setDelayedCards([]);
    setBudgetInfo(null);
    setCountdown(null);
  }, [selectedGroupId]);

  const handleRate = async (rating: number) => {
    if (!card) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) return;
      const result = await res.json();

      setTotalReviewed((n) => n + 1);

      // Remove current card from immediate queue
      setImmediateQueue((prev) => prev.slice(1));

      // Check if card comes back today
      if (nextRollover && new Date(result.scheduledAt) < nextRollover) {
        // Card is delayed — will come back in this session
        setDelayedCards((prev) => [
          ...prev,
          { card: result.card, availableAt: new Date(result.scheduledAt) },
        ]);
      }
      // else: card is done for today

      setRevealed(false);
      await onUpdate();
    } finally {
      setSubmitting(false);
    }
  };

  const ratings = [
    { label: "Again", value: 1, color: "bg-red-600 hover:bg-red-700" },
    { label: "Hard", value: 2, color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Good", value: 3, color: "bg-green-600 hover:bg-green-700" },
    { label: "Easy", value: 4, color: "bg-blue-600 hover:bg-blue-700" },
  ];

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500">No cards yet. Add some in the Cards tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center">
        {!sessionStarted ? (
          <button
            onClick={startSession}
            className="px-8 py-4 text-lg bg-black text-white border-2 border-white rounded-lg hover:bg-neutral-800"
          >
            Start Review
          </button>
        ) : isComplete ? (
          <div className="text-neutral-500 text-center">
            <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              All caught up!
            </p>
            <p className="text-sm mb-2">Reviewed {totalReviewed} cards this session.</p>
            {budgetInfo && (
              <div className="text-sm space-y-1">
                <p>New today: {budgetInfo.newUsed + budgetInfo.newAvailable} / {budgetInfo.newLimit}</p>
                <p>Reviews today: {budgetInfo.reviewUsed + budgetInfo.reviewAvailable} / {budgetInfo.reviewLimit}</p>
              </div>
            )}
          </div>
        ) : isWaiting ? (
          <div className="text-center">
            <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              Waiting for cards...
            </p>
            {countdown && (
              <p className="text-3xl font-mono text-neutral-600 dark:text-neutral-400 mb-2">
                {countdown}
              </p>
            )}
            <p className="text-sm text-neutral-500">
              {delayedCards.length} card{delayedCards.length > 1 ? "s" : ""} coming back
            </p>
          </div>
        ) : card ? (
          <div className="w-full max-w-xl">
            <div
              onClick={() => !revealed && setRevealed(true)}
              className={`border border-neutral-200 dark:border-neutral-700 rounded-lg p-6 ${!revealed ? "cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-500" : ""}`}
            >
              {card.title ? (
                <>
                  <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
                  {!revealed && (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-4">Click to reveal answer</p>
                  )}
                  {revealed && (
                    <>
                      <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
                      <div className="mb-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Definition</span>
                        <p className="mt-1 text-base leading-relaxed">{card.definition}</p>
                      </div>
                      {card.example && (
                        <div className="mt-4 bg-neutral-50 dark:bg-neutral-800/50 rounded p-3">
                          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Example</span>
                          <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{card.example}</p>
                        </div>
                      )}
                      <div className="flex gap-2 mt-6">
                        {ratings.map((r) => (
                          <button
                            key={r.value}
                            disabled={submitting}
                            onClick={(e) => { e.stopPropagation(); handleRate(r.value); }}
                            className={`px-4 py-2 text-sm text-white rounded ${r.color} disabled:opacity-50`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="text-lg mb-4 [&_img]:max-w-full [&_img]:h-auto" dangerouslySetInnerHTML={{ __html: card.front }} />
                  {!revealed && (
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">Click to reveal answer</p>
                  )}
                  {revealed && (
                    <>
                      <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
                      <div className="text-lg mb-6 [&_img]:max-w-full [&_img]:h-auto" dangerouslySetInnerHTML={{ __html: card.back }} />
                      <div className="flex gap-2">
                        {ratings.map((r) => (
                          <button
                            key={r.value}
                            disabled={submitting}
                            onClick={(e) => { e.stopPropagation(); handleRate(r.value); }}
                            className={`px-4 py-2 text-sm text-white rounded ${r.color} disabled:opacity-50`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Progress info */}
      {sessionStarted && !isComplete && (
        <div className="flex justify-end pt-2">
          <div className="text-xs text-neutral-400 dark:text-neutral-500 text-right space-y-0.5">
            <p>
              {immediateQueue.length} ready{delayedCards.length > 0 ? ` | ${delayedCards.length} delayed` : ""}
            </p>
            <p>{totalReviewed} reviewed</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update the `StudyCard` interface at the top of `page.tsx`**

Add `scheduled_at` to the interface:

```typescript
interface StudyCard {
  id: string;
  front: string;
  back: string;
  title?: string;
  definition?: string;
  example?: string;
  source: string | null;
  group_id: string | null;
  scheduled_at: string;
  fsrs: FSRSData;
  created_at: string;
  updated_at: string;
}
```

**Step 3: Verify in browser**

1. Go to `/study`, select a group, click "Start Review"
2. Rate a card "Again" — it should disappear and a countdown should appear
3. Wait for the countdown — the card should reappear
4. Rate it "Good" or "Easy" — if interval is > 1 day, it should leave the session
5. Session should only end when all cards are scheduled beyond the next rollover

**Step 4: Commit**

```bash
git add workbench/src/app/study/page.tsx
git commit -m "feat: rewrite ReviewTab with intra-day re-queuing and countdown timer"
```

---

## Task 8: Settings UI — Add Rollover Hour

**Files:**
- Modify: `workbench/src/app/study/page.tsx` (GroupSettingsEditor)

**Step 1: Update the `Group` interface to include `rolloverHour`**

The `Group` interface in `page.tsx` needs to match the new API response:

```typescript
interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
    rolloverHour: number;
  };
  created_at: string;
}
```

**Step 2: Update `GroupSettingsEditor` to include rollover hour**

Add a rollover hour input field to the `GroupSettingsEditor` component. Add state:

```typescript
const [rolloverHour, setRolloverHour] = useState(group.settings.rolloverHour ?? 5);
```

Add the input field after the daily review limit input:

```tsx
<div>
  <label className="block text-sm font-medium mb-1">Day Rollover Hour</label>
  <input
    type="number"
    min={0}
    max={23}
    value={rolloverHour}
    onChange={(e) => setRolloverHour(parseInt(e.target.value) || 0)}
    className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800"
  />
  <p className="text-xs text-neutral-400 mt-1">Hour (0-23) when a new study day begins</p>
</div>
```

Update the `handleSave` call to include `rolloverHour`:

```typescript
const handleSave = async () => {
  if (!name.trim()) return;
  setSaving(true);
  await onSave(name.trim(), { dailyNewLimit, dailyReviewLimit, rolloverHour });
  setSaving(false);
};
```

Update the `onSave` prop type to include `rolloverHour`:

```typescript
onSave: (
  name: string,
  settings: { dailyNewLimit: number; dailyReviewLimit: number; rolloverHour: number }
) => Promise<void>;
```

Also update the settings display in `SettingsTab` to show rollover hour:

```tsx
<span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
  New: {g.settings.dailyNewLimit} / Review: {g.settings.dailyReviewLimit} / Rollover: {g.settings.rolloverHour}:00
</span>
```

**Step 3: Verify**

Open Settings tab, edit a group, change rollover hour, save. Verify it persists on reload.

**Step 4: Commit**

```bash
git add workbench/src/app/study/page.tsx
git commit -m "feat: add rollover hour setting to group settings editor"
```

---

## Task 9: Cleanup — Remove Old JSON Libraries

**Files:**
- Delete: `workbench/src/lib/cards.ts`
- Delete: `workbench/src/lib/groups.ts`
- Delete: `workbench/src/lib/study-log.ts`

**Step 1: Delete old files**

```bash
rm workbench/src/lib/cards.ts workbench/src/lib/groups.ts workbench/src/lib/study-log.ts
```

**Step 2: Verify no remaining imports**

Search for any lingering imports of the old modules:

```bash
grep -r "from.*@/lib/cards" workbench/src/ --include="*.ts" --include="*.tsx"
grep -r "from.*@/lib/groups" workbench/src/ --include="*.ts" --include="*.tsx"
grep -r "from.*@/lib/study-log" workbench/src/ --include="*.ts" --include="*.tsx"
```

The only remaining import of `@/lib/cards` should be in `anki-import.ts` — but we removed that dependency in Task 6. If any remain, update them to import from `@/lib/db`.

**Step 3: Add `data/workbench.db` to `.gitignore`**

Append to `.gitignore`:

```
data/workbench.db
data/workbench.db-wal
data/workbench.db-shm
data/*.bak
```

**Step 4: Verify the full app works**

1. Browse `/study` — groups and cards load
2. Create a new group in Settings
3. Add a card in Cards tab
4. Start a review session — intra-day re-queuing works
5. Import an Anki deck — cards distributed across days
6. Delete a group — cascading delete works

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove old JSON storage layer, add db files to gitignore"
```

---

## Task Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | SQLite foundation + migration | `lib/db.ts`, `api/migrate/route.ts` |
| 2 | Groups DB layer + API | `lib/db.ts`, `api/groups/` |
| 3 | Cards DB layer + distribution | `lib/db.ts`, `api/cards/` |
| 4 | Study log + review API | `lib/db.ts`, `api/cards/[id]/review/` |
| 5 | Session endpoint | `lib/db.ts`, `api/cards/session/` |
| 6 | Anki import update | `api/import/anki/route.ts` |
| 7 | ReviewTab rewrite | `app/study/page.tsx` |
| 8 | Settings UI (rollover hour) | `app/study/page.tsx` |
| 9 | Cleanup old files | Delete `lib/cards.ts`, `lib/groups.ts`, `lib/study-log.ts` |
