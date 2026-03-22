import Database from "better-sqlite3";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initHomeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS home_posts (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      image_url   TEXT,
      created_at  TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbHomePost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

export interface HomePostJson {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

function toHomePostJson(row: DbHomePost): HomePostJson {
  return {
    id: row.id,
    content: row.content,
    image_url: row.image_url,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function createHomePost(data: {
  content: string;
  image_url?: string;
}): HomePostJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO home_posts (id, content, image_url, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, data.content, data.image_url ?? null, now);

  return getHomePost(id)!;
}

export function getAllHomePosts(): HomePostJson[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM home_posts ORDER BY created_at DESC, rowid DESC")
    .all() as DbHomePost[];
  return rows.map(toHomePostJson);
}

export function getHomePost(id: string): HomePostJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM home_posts WHERE id = ?")
    .get(id) as DbHomePost | undefined;
  return row ? toHomePostJson(row) : undefined;
}

export function updateHomePost(
  id: string,
  updates: {
    content?: string;
    image_url?: string | null;
  }
): HomePostJson | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM home_posts WHERE id = ?")
    .get(id) as DbHomePost | undefined;
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    sets.push("content = ?");
    values.push(updates.content);
  }
  if (updates.image_url !== undefined) {
    sets.push("image_url = ?");
    values.push(updates.image_url);
  }

  if (sets.length === 0) return toHomePostJson(existing);

  values.push(id);

  db.prepare(`UPDATE home_posts SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getHomePost(id)!;
}

export function deleteHomePost(id: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM home_posts WHERE id = ?").run(id).changes > 0;
}
