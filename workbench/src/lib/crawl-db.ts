import Database from "better-sqlite3";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export function initCrawlSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arxiv_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      results     TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_arxiv_cache_query
      ON arxiv_cache(query);

    CREATE INDEX IF NOT EXISTS idx_arxiv_cache_timestamp
      ON arxiv_cache(timestamp);
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbArxivCache {
  id: string;
  query: string;
  results: string;
  result_count: number;
  timestamp: number;
  created_at: string;
}

export interface ArxivCacheJson {
  id: string;
  query: string;
  results: unknown[];
  result_count: number;
  timestamp: number;
  created_at: string;
}

function toArxivCacheJson(row: DbArxivCache): ArxivCacheJson {
  return {
    id: row.id,
    query: row.query,
    results: JSON.parse(row.results),
    result_count: row.result_count,
    timestamp: row.timestamp,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function createArxivCache(data: {
  query: string;
  results: unknown[];
}): ArxivCacheJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.getTime();
  const created_at = now.toISOString();
  const resultsJson = JSON.stringify(data.results);
  const result_count = data.results.length;

  db.prepare(
    `INSERT INTO arxiv_cache (id, query, results, result_count, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.query, resultsJson, result_count, timestamp, created_at);

  return getArxivCacheById(id)!;
}

export function getArxivCache(query: string): ArxivCacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM arxiv_cache WHERE query = ? ORDER BY timestamp DESC LIMIT 1"
    )
    .get(query) as DbArxivCache | undefined;
  return row ? toArxivCacheJson(row) : undefined;
}

function getArxivCacheById(id: string): ArxivCacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM arxiv_cache WHERE id = ?")
    .get(id) as DbArxivCache | undefined;
  return row ? toArxivCacheJson(row) : undefined;
}

export function getAllArxivCache(): ArxivCacheJson[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM arxiv_cache ORDER BY timestamp DESC")
    .all() as DbArxivCache[];
  return rows.map(toArxivCacheJson);
}

export function deleteArxivCache(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM arxiv_cache WHERE id = ?").run(id);
  return result.changes > 0;
}

export function deleteExpiredArxivCache(beforeTimestamp: number): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM arxiv_cache WHERE timestamp < ?")
    .run(beforeTimestamp);
  return result.changes;
}
