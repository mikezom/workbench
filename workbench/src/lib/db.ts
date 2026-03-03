import Database from "better-sqlite3";
import { existsSync, readFileSync, renameSync } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Singleton database connection
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), "data", "workbench.db");
  _db = new Database(dbPath);

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
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
