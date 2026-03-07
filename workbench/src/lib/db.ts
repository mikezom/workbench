import Database from "better-sqlite3";
import { existsSync, readFileSync, renameSync } from "fs";
import path from "path";
import { fsrs, Rating, type Grade, type Card as FSRSCard } from "ts-fsrs";
import { initAgentSchema } from "./agent-db";
import { initClipboardSchema } from "./clipboard-db";
import { initCrawlSchema } from "./crawl-db";
import { initHomeSchema } from "./home-db";
import { initMonitorSchema } from "./monitor-db";

const f = fsrs();

// ---------------------------------------------------------------------------
// Singleton database connection
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Use in-memory database for tests
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const dbPath = isTest ? ':memory:' : path.join(process.cwd(), "data", "workbench.db");

  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  initAgentSchema(_db);
  initClipboardSchema(_db);
  initCrawlSchema(_db);
  initHomeSchema(_db);
  initMonitorSchema(_db);
  return _db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      parent_id         TEXT REFERENCES groups(id) ON DELETE SET NULL,
      daily_new_limit   INTEGER NOT NULL DEFAULT 20,
      daily_review_limit INTEGER NOT NULL DEFAULT 100,
      rollover_hour     INTEGER NOT NULL DEFAULT 5,
      created_at        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id                 TEXT PRIMARY KEY,
      front              TEXT NOT NULL DEFAULT '',
      back               TEXT NOT NULL DEFAULT '',
      title              TEXT,
      definition         TEXT,
      example            TEXT,
      source             TEXT,
      group_id           TEXT REFERENCES groups(id) ON DELETE CASCADE,
      scheduled_at       TEXT NOT NULL,
      fsrs_state         INTEGER NOT NULL DEFAULT 0,
      fsrs_stability     REAL NOT NULL DEFAULT 0,
      fsrs_difficulty    REAL NOT NULL DEFAULT 0,
      fsrs_elapsed_days  REAL NOT NULL DEFAULT 0,
      fsrs_scheduled_days REAL NOT NULL DEFAULT 0,
      fsrs_reps          INTEGER NOT NULL DEFAULT 0,
      fsrs_lapses        INTEGER NOT NULL DEFAULT 0,
      fsrs_last_review   TEXT,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_group_scheduled
      ON cards(group_id, scheduled_at);

    CREATE TABLE IF NOT EXISTS study_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      rating      INTEGER NOT NULL,
      was_new     INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_study_log_group_date
      ON study_log(group_id, reviewed_at);
  `);
}

// ---------------------------------------------------------------------------
// JSON -> SQLite migration
// ---------------------------------------------------------------------------

interface JsonGroup {
  id: string;
  name: string;
  parent_id: string | null;
  settings: {
    dailyNewLimit: number;
    dailyReviewLimit: number;
  };
  created_at: string;
}

interface JsonCard {
  id: string;
  front: string;
  back: string;
  title: string | null;
  definition: string | null;
  example: string | null;
  source: string | null;
  group_id: string;
  fsrs: {
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface MigrationResult {
  migrated: boolean;
  groups: number;
  cards: number;
}

export async function migrateFromJson(): Promise<MigrationResult> {
  const dataDir = path.join(process.cwd(), "data");
  const groupsPath = path.join(dataDir, "groups.json");
  const cardsPath = path.join(dataDir, "cards.json");
  const studyLogPath = path.join(dataDir, "study_log.json");

  // If groups.json doesn't exist, nothing to migrate
  if (!existsSync(groupsPath)) {
    return { migrated: false, groups: 0, cards: 0 };
  }

  const db = getDb();

  // If groups table already has data, skip migration
  const existing = db.prepare("SELECT COUNT(*) as count FROM groups").get() as {
    count: number;
  };
  if (existing.count > 0) {
    return { migrated: false, groups: 0, cards: 0 };
  }

  // Read JSON files
  const groups: JsonGroup[] = JSON.parse(readFileSync(groupsPath, "utf-8"));
  const cards: JsonCard[] = existsSync(cardsPath)
    ? JSON.parse(readFileSync(cardsPath, "utf-8"))
    : [];

  // Insert everything in a transaction
  const insertGroup = db.prepare(`
    INSERT INTO groups (id, name, parent_id, daily_new_limit, daily_review_limit, rollover_hour, created_at)
    VALUES (@id, @name, @parent_id, @daily_new_limit, @daily_review_limit, @rollover_hour, @created_at)
  `);

  const insertCard = db.prepare(`
    INSERT INTO cards (
      id, front, back, title, definition, example, source, group_id,
      scheduled_at, fsrs_state, fsrs_stability, fsrs_difficulty,
      fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses,
      fsrs_last_review, created_at, updated_at
    ) VALUES (
      @id, @front, @back, @title, @definition, @example, @source, @group_id,
      @scheduled_at, @fsrs_state, @fsrs_stability, @fsrs_difficulty,
      @fsrs_elapsed_days, @fsrs_scheduled_days, @fsrs_reps, @fsrs_lapses,
      @fsrs_last_review, @created_at, @updated_at
    )
  `);

  const migrate = db.transaction(() => {
    for (const g of groups) {
      insertGroup.run({
        id: g.id,
        name: g.name,
        parent_id: g.parent_id,
        daily_new_limit: g.settings.dailyNewLimit,
        daily_review_limit: g.settings.dailyReviewLimit,
        rollover_hour: 5,
        created_at: g.created_at,
      });
    }

    for (const c of cards) {
      insertCard.run({
        id: c.id,
        front: c.front,
        back: c.back,
        title: c.title,
        definition: c.definition,
        example: c.example,
        source: c.source,
        group_id: c.group_id,
        scheduled_at: c.fsrs.due,
        fsrs_state: c.fsrs.state,
        fsrs_stability: c.fsrs.stability,
        fsrs_difficulty: c.fsrs.difficulty,
        fsrs_elapsed_days: c.fsrs.elapsed_days,
        fsrs_scheduled_days: c.fsrs.scheduled_days,
        fsrs_reps: c.fsrs.reps,
        fsrs_lapses: c.fsrs.lapses,
        fsrs_last_review: c.fsrs.last_review ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      });
    }
  });

  migrate();

  // Rename source files to .bak
  renameSync(groupsPath, groupsPath + ".bak");
  if (existsSync(cardsPath)) {
    renameSync(cardsPath, cardsPath + ".bak");
  }
  if (existsSync(studyLogPath)) {
    renameSync(studyLogPath, studyLogPath + ".bak");
  }

  return { migrated: true, groups: groups.length, cards: cards.length };
}

// ---------------------------------------------------------------------------
// Group types
// ---------------------------------------------------------------------------

export interface DbGroup {
  id: string;
  name: string;
  parent_id: string | null;
  daily_new_limit: number;
  daily_review_limit: number;
  rollover_hour: number;
  created_at: string;
}

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

// ---------------------------------------------------------------------------
// Group queries
// ---------------------------------------------------------------------------

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
  parentId: string | null = null,
  settings?: { dailyNewLimit?: number; dailyReviewLimit?: number; rolloverHour?: number }
): GroupJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO groups (id, name, parent_id, daily_new_limit, daily_review_limit, rollover_hour, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    parentId,
    settings?.dailyNewLimit ?? 20,
    settings?.dailyReviewLimit ?? 100,
    settings?.rolloverHour ?? 5,
    now
  );

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
  const newDailyNew = updates.settings?.dailyNewLimit ?? existing.daily_new_limit;
  const newDailyReview = updates.settings?.dailyReviewLimit ?? existing.daily_review_limit;
  const newRollover = updates.settings?.rolloverHour ?? existing.rollover_hour;

  db.prepare(
    `UPDATE groups SET name = ?, daily_new_limit = ?, daily_review_limit = ?, rollover_hour = ? WHERE id = ?`
  ).run(newName, newDailyNew, newDailyReview, newRollover, id);

  return getGroup(id)!;
}

export function getDescendantIds(id: string): string[] {
  const db = getDb();
  const result: string[] = [id];
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = db
      .prepare("SELECT id FROM groups WHERE parent_id = ?")
      .all(current) as { id: string }[];
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}

export function deleteGroupCascade(id: string): { deleted: boolean; cardsDeleted: number } {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM groups WHERE id = ?").get(id) as { id: string } | undefined;
  if (!existing) return { deleted: false, cardsDeleted: 0 };

  const ids = getDescendantIds(id);
  const placeholders = ids.map(() => "?").join(", ");

  const result = db.transaction(() => {
    // Count cards that will be deleted
    const countResult = db
      .prepare(`SELECT COUNT(*) as count FROM cards WHERE group_id IN (${placeholders})`)
      .get(...ids) as { count: number };
    const cardsDeleted = countResult.count;

    // Delete study_log entries for these groups
    db.prepare(`DELETE FROM study_log WHERE group_id IN (${placeholders})`).run(...ids);

    // Delete cards in these groups
    db.prepare(`DELETE FROM cards WHERE group_id IN (${placeholders})`).run(...ids);

    // Delete the groups themselves (children first via reversed order is not needed since
    // parent_id has ON DELETE SET NULL, but we can delete all at once)
    db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).run(...ids);

    return cardsDeleted;
  })();

  return { deleted: true, cardsDeleted: result };
}

// ---------------------------------------------------------------------------
// Card types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Rollover boundary helper
// ---------------------------------------------------------------------------

export function getRolloverBoundary(
  rolloverHour: number,
  now?: Date
): { current: Date; next: Date } {
  const n = now ?? new Date();

  // Build today's rollover in local time
  const current = new Date(n);
  current.setHours(rolloverHour, 0, 0, 0);
  if (n < current) {
    // Before today's rollover -> current = yesterday's rollover
    current.setDate(current.getDate() - 1);
  }

  const next = new Date(current);
  next.setDate(next.getDate() + 1);
  return { current, next };
}

// ---------------------------------------------------------------------------
// New card distribution (private)
// ---------------------------------------------------------------------------

function computeNewCardSlot(
  db: Database.Database,
  groupId: string,
  now: Date
): string {
  const group = db
    .prepare("SELECT rollover_hour, daily_new_limit FROM groups WHERE id = ?")
    .get(groupId) as { rollover_hour: number; daily_new_limit: number } | undefined;

  if (!group) {
    return now.toISOString();
  }

  const { current: todayRollover } = getRolloverBoundary(group.rollover_hour, now);

  const countStmt = db.prepare(
    `SELECT COUNT(*) as count FROM cards
     WHERE group_id = ? AND fsrs_state = 0
       AND scheduled_at >= ? AND scheduled_at < ?`
  );

  for (let day = 0; day <= 365; day++) {
    const slotStart = new Date(todayRollover.getTime() + day * 24 * 60 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);

    const row = countStmt.get(
      groupId,
      slotStart.toISOString(),
      slotEnd.toISOString()
    ) as { count: number };

    if (row.count < group.daily_new_limit) {
      return slotStart.toISOString();
    }
  }

  // Fallback: 365 days from today's rollover
  return new Date(
    todayRollover.getTime() + 365 * 24 * 60 * 60 * 1000
  ).toISOString();
}

// ---------------------------------------------------------------------------
// Card queries
// ---------------------------------------------------------------------------

export function getAllCards(): CardJson[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM cards ORDER BY created_at").all() as DbCard[];
  return rows.map(toCardJson);
}

export function getCard(id: string): CardJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM cards WHERE id = ?")
    .get(id) as DbCard | undefined;
  return row ? toCardJson(row) : undefined;
}

export function createCard(data: {
  front: string;
  back: string;
  group_id?: string | null;
  title?: string;
  definition?: string;
  example?: string;
}): CardJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();

  const scheduledAt =
    data.group_id ? computeNewCardSlot(db, data.group_id, now) : nowIso;

  db.prepare(
    `INSERT INTO cards (
      id, front, back, title, definition, example, source, group_id,
      scheduled_at, fsrs_state, fsrs_stability, fsrs_difficulty,
      fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses,
      fsrs_last_review, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, NULL, ?,
      ?, 0, 0, 0,
      0, 0, 0, 0,
      NULL, ?, ?
    )`
  ).run(
    id,
    data.front,
    data.back,
    data.title ?? null,
    data.definition ?? null,
    data.example ?? null,
    data.group_id ?? null,
    scheduledAt,
    nowIso,
    nowIso
  );

  return getCard(id)!;
}

export function updateCard(
  id: string,
  updates: {
    front?: string;
    back?: string;
    group_id?: string | null;
    title?: string;
    definition?: string;
    example?: string;
  }
): CardJson | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM cards WHERE id = ?")
    .get(id) as DbCard | undefined;
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.front !== undefined) {
    sets.push("front = ?");
    values.push(updates.front);
  }
  if (updates.back !== undefined) {
    sets.push("back = ?");
    values.push(updates.back);
  }
  if (updates.group_id !== undefined) {
    sets.push("group_id = ?");
    values.push(updates.group_id);
  }
  if (updates.title !== undefined) {
    sets.push("title = ?");
    values.push(updates.title);
  }
  if (updates.definition !== undefined) {
    sets.push("definition = ?");
    values.push(updates.definition);
  }
  if (updates.example !== undefined) {
    sets.push("example = ?");
    values.push(updates.example);
  }

  if (sets.length === 0) return toCardJson(existing);

  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE cards SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  return getCard(id)!;
}

export function deleteCard(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Bulk create for Anki import
// ---------------------------------------------------------------------------

export function createCardsBulk(
  cards: Array<{
    front: string;
    back: string;
    group_id?: string | null;
    title?: string;
    definition?: string;
    example?: string;
  }>
): CardJson[] {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();

  // Pre-compute slot counters per group to avoid re-querying per card
  const slotCounters = new Map<
    string,
    { rolloverHour: number; dailyNewLimit: number; countsPerDay: Map<string, number> }
  >();

  function getOrInitGroupSlots(groupId: string) {
    let entry = slotCounters.get(groupId);
    if (entry) return entry;

    const group = db
      .prepare("SELECT rollover_hour, daily_new_limit FROM groups WHERE id = ?")
      .get(groupId) as { rollover_hour: number; daily_new_limit: number } | undefined;

    if (!group) {
      entry = { rolloverHour: 5, dailyNewLimit: 20, countsPerDay: new Map() };
      slotCounters.set(groupId, entry);
      return entry;
    }

    const { current: todayRollover } = getRolloverBoundary(group.rollover_hour, now);

    // Pre-load existing new-card counts per day-slot for this group
    const countsPerDay = new Map<string, number>();

    const countStmt = db.prepare(
      `SELECT COUNT(*) as count FROM cards
       WHERE group_id = ? AND fsrs_state = 0
         AND scheduled_at >= ? AND scheduled_at < ?`
    );

    // Pre-load counts for the first 366 day slots
    for (let day = 0; day <= 365; day++) {
      const slotStart = new Date(todayRollover.getTime() + day * 24 * 60 * 60 * 1000);
      const slotEnd = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);
      const row = countStmt.get(
        groupId,
        slotStart.toISOString(),
        slotEnd.toISOString()
      ) as { count: number };
      if (row.count > 0) {
        countsPerDay.set(slotStart.toISOString(), row.count);
      }
    }

    entry = {
      rolloverHour: group.rollover_hour,
      dailyNewLimit: group.daily_new_limit,
      countsPerDay,
    };
    slotCounters.set(groupId, entry);
    return entry;
  }

  function findSlotForGroup(groupId: string): string {
    const info = getOrInitGroupSlots(groupId);
    const { current: todayRollover } = getRolloverBoundary(info.rolloverHour, now);

    for (let day = 0; day <= 365; day++) {
      const slotStart = new Date(todayRollover.getTime() + day * 24 * 60 * 60 * 1000);
      const key = slotStart.toISOString();
      const currentCount = info.countsPerDay.get(key) ?? 0;

      if (currentCount < info.dailyNewLimit) {
        info.countsPerDay.set(key, currentCount + 1);
        return key;
      }
    }

    // Fallback
    return new Date(
      getRolloverBoundary(info.rolloverHour, now).current.getTime() +
        365 * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  const insertStmt = db.prepare(
    `INSERT INTO cards (
      id, front, back, title, definition, example, source, group_id,
      scheduled_at, fsrs_state, fsrs_stability, fsrs_difficulty,
      fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses,
      fsrs_last_review, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, NULL, ?,
      ?, 0, 0, 0,
      0, 0, 0, 0,
      NULL, ?, ?
    )`
  );

  const createdIds: string[] = [];

  const runInserts = db.transaction(() => {
    for (const c of cards) {
      const id = crypto.randomUUID();
      const scheduledAt = c.group_id
        ? findSlotForGroup(c.group_id)
        : nowIso;

      insertStmt.run(
        id,
        c.front,
        c.back,
        c.title ?? null,
        c.definition ?? null,
        c.example ?? null,
        c.group_id ?? null,
        scheduledAt,
        nowIso,
        nowIso
      );

      createdIds.push(id);
    }
  });

  runInserts();

  // Retrieve all created cards
  if (createdIds.length === 0) return [];

  const placeholders = createdIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT * FROM cards WHERE id IN (${placeholders}) ORDER BY created_at`)
    .all(...createdIds) as DbCard[];

  return rows.map(toCardJson);
}

// ---------------------------------------------------------------------------
// Session query
// ---------------------------------------------------------------------------

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

  // 1. Determine rollover_hour, daily_new_limit, daily_review_limit
  let rolloverHour = 5;
  let dailyNewLimit = 20;
  let dailyReviewLimit = 100;

  if (groupId) {
    const group = db
      .prepare(
        "SELECT rollover_hour, daily_new_limit, daily_review_limit FROM groups WHERE id = ?"
      )
      .get(groupId) as
      | { rollover_hour: number; daily_new_limit: number; daily_review_limit: number }
      | undefined;

    if (group) {
      rolloverHour = group.rollover_hour;
      dailyNewLimit = group.daily_new_limit;
      dailyReviewLimit = group.daily_review_limit;
    }
  }

  // 2. Get rollover boundaries
  const { next } = getRolloverBoundary(rolloverHour);
  const now = new Date().toISOString();

  // 3. Get due cards
  let dueCards: DbCard[];
  if (groupId) {
    const descendantIds = getDescendantIds(groupId);
    const placeholders = descendantIds.map(() => "?").join(", ");
    dueCards = db
      .prepare(
        `SELECT * FROM cards
         WHERE group_id IN (${placeholders}) AND scheduled_at <= ?
         ORDER BY scheduled_at ASC`
      )
      .all(...descendantIds, now) as DbCard[];
  } else {
    dueCards = db
      .prepare(
        `SELECT * FROM cards
         WHERE scheduled_at <= ?
         ORDER BY scheduled_at ASC`
      )
      .all(now) as DbCard[];
  }

  // 4. Separate into new and review
  const newCards = dueCards.filter((c) => c.fsrs_state === 0);
  const reviewCards = dueCards.filter((c) => c.fsrs_state > 0);

  // 5. Get today's studied counts
  let studiedToday = { new: 0, review: 0 };
  if (groupId) {
    studiedToday = getGroupStudiedToday(groupId);
  }

  // 6. Apply limits
  const newRemaining = Math.max(0, dailyNewLimit - studiedToday.new);
  const reviewRemaining = Math.max(0, dailyReviewLimit - studiedToday.review);

  // 7. Slice
  const limitedNew = newCards.slice(0, newRemaining);
  const limitedReview = reviewCards.slice(0, reviewRemaining);

  // 8. Return
  return {
    cards: [...limitedNew, ...limitedReview].map(toCardJson),
    nextRollover: next.toISOString(),
    budgetInfo: {
      newUsed: studiedToday.new,
      newLimit: dailyNewLimit,
      reviewUsed: studiedToday.review,
      reviewLimit: dailyReviewLimit,
      newAvailable: limitedNew.length,
      reviewAvailable: limitedReview.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Study log helpers
// ---------------------------------------------------------------------------

export function getGroupStudiedToday(
  groupId: string
): { new: number; review: number } {
  const db = getDb();

  const group = db
    .prepare("SELECT rollover_hour FROM groups WHERE id = ?")
    .get(groupId) as { rollover_hour: number } | undefined;

  const rolloverHour = group?.rollover_hour ?? 5;
  const { current: rolloverStart } = getRolloverBoundary(rolloverHour);

  // Include all descendant groups so daily limits are enforced across children
  const ids = getDescendantIds(groupId);
  const placeholders = ids.map(() => "?").join(", ");

  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(was_new = 1), 0) AS new_count,
         COALESCE(SUM(was_new = 0), 0) AS review_count
       FROM study_log
       WHERE group_id IN (${placeholders}) AND reviewed_at >= ?`
    )
    .get(...ids, rolloverStart.toISOString()) as {
    new_count: number;
    review_count: number;
  };

  return { new: row.new_count, review: row.review_count };
}

function recordStudy(
  db: Database.Database,
  cardId: string,
  groupId: string,
  rating: Rating,
  wasNew: boolean
): void {
  db.prepare(
    `INSERT INTO study_log (card_id, group_id, rating, was_new, reviewed_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(cardId, groupId, rating, wasNew ? 1 : 0, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export interface ReviewResult {
  card: CardJson;
  scheduledAt: string;
  intervalMinutes: number;
}

export function reviewCard(
  cardId: string,
  rating: Rating
): ReviewResult | null {
  const db = getDb();

  const row = db
    .prepare("SELECT * FROM cards WHERE id = ?")
    .get(cardId) as DbCard | undefined;
  if (!row) return null;

  const wasNew = row.fsrs_state === 0;

  // Build a ts-fsrs Card from the DB row
  const fsrsCard: FSRSCard = {
    due: new Date(row.scheduled_at),
    stability: row.fsrs_stability,
    difficulty: row.fsrs_difficulty,
    elapsed_days: row.fsrs_elapsed_days,
    scheduled_days: row.fsrs_scheduled_days,
    learning_steps: 0,
    reps: row.fsrs_reps,
    lapses: row.fsrs_lapses,
    state: row.fsrs_state,
    last_review: row.fsrs_last_review
      ? new Date(row.fsrs_last_review)
      : undefined,
  };

  const now = new Date();
  const result = f.next(fsrsCard, now, rating as Grade);
  const newCard = result.card;
  const newDue = newCard.due;
  const scheduledAt = newDue.toISOString();
  const intervalMinutes = Math.round(
    (newDue.getTime() - now.getTime()) / 60000
  );

  // Wrap card update + study log insert in a transaction for atomicity
  const doReview = db.transaction(() => {
    db.prepare(
      `UPDATE cards SET
         scheduled_at       = ?,
         fsrs_state         = ?,
         fsrs_stability     = ?,
         fsrs_difficulty    = ?,
         fsrs_elapsed_days  = ?,
         fsrs_scheduled_days = ?,
         fsrs_reps          = ?,
         fsrs_lapses        = ?,
         fsrs_last_review   = ?,
         updated_at         = ?
       WHERE id = ?`
    ).run(
      scheduledAt,
      newCard.state as number,
      newCard.stability,
      newCard.difficulty,
      newCard.elapsed_days,
      newCard.scheduled_days,
      newCard.reps,
      newCard.lapses,
      newCard.last_review ? newCard.last_review.toISOString() : null,
      now.toISOString(),
      cardId
    );

    if (row.group_id) {
      recordStudy(db, cardId, row.group_id, rating, wasNew);
    }
  });

  doReview();

  return {
    card: getCard(cardId)!,
    scheduledAt,
    intervalMinutes,
  };
}
