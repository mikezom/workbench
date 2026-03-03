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
