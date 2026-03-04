import Database from "better-sqlite3";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initClipboardSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      language    TEXT,
      created_at  TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbClipboardItem {
  id: string;
  content: string;
  language: string | null;
  created_at: string;
}

export interface ClipboardItemJson {
  id: string;
  content: string;
  language: string | null;
  created_at: string;
}

function toClipboardItemJson(row: DbClipboardItem): ClipboardItemJson {
  return {
    id: row.id,
    content: row.content,
    language: row.language,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function createClipboardItem(data: {
  content: string;
  language?: string;
}): ClipboardItemJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO clipboard_items (id, content, language, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, data.content, data.language ?? null, now);

  return getClipboardItem(id)!;
}

export function getAllClipboardItems(): ClipboardItemJson[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM clipboard_items ORDER BY created_at DESC")
    .all() as DbClipboardItem[];
  return rows.map(toClipboardItemJson);
}

export function getClipboardItem(id: string): ClipboardItemJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM clipboard_items WHERE id = ?")
    .get(id) as DbClipboardItem | undefined;
  return row ? toClipboardItemJson(row) : undefined;
}

export function updateClipboardItem(
  id: string,
  updates: {
    content?: string;
    language?: string;
  }
): ClipboardItemJson | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM clipboard_items WHERE id = ?")
    .get(id) as DbClipboardItem | undefined;
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    sets.push("content = ?");
    values.push(updates.content);
  }
  if (updates.language !== undefined) {
    sets.push("language = ?");
    values.push(updates.language);
  }

  if (sets.length === 0) return toClipboardItemJson(existing);

  values.push(id);

  db.prepare(`UPDATE clipboard_items SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getClipboardItem(id)!;
}

export function deleteClipboardItem(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM clipboard_items WHERE id = ?").run(id);
  return result.changes > 0;
}
