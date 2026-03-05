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

    CREATE TABLE IF NOT EXISTS jin10_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      results     TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jin10_cache_query
      ON jin10_cache(query);

    CREATE INDEX IF NOT EXISTS idx_jin10_cache_timestamp
      ON jin10_cache(timestamp);

    CREATE TABLE IF NOT EXISTS solidot_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      results     TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_solidot_cache_query
      ON solidot_cache(query);

    CREATE INDEX IF NOT EXISTS idx_solidot_cache_timestamp
      ON solidot_cache(timestamp);
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
// Jin10 Types
// ---------------------------------------------------------------------------

export interface Jin10NewsItem {
  id: string;
  title: string;
  timestamp: string;
  summary?: string;
  link?: string;
}

export interface DbJin10Cache {
  id: string;
  query: string;
  results: string;
  result_count: number;
  timestamp: number;
  created_at: string;
}

export interface Jin10CacheJson {
  id: string;
  query: string;
  results: Jin10NewsItem[];
  result_count: number;
  timestamp: number;
  created_at: string;
}

function toJin10CacheJson(row: DbJin10Cache): Jin10CacheJson {
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
// SOLIDOT Types
// ---------------------------------------------------------------------------

export interface SolidotNewsItem {
  id: string;
  title: string;
  link: string;
  timestamp: string;
  summary?: string;
}

export interface DbSolidotCache {
  id: string;
  query: string;
  results: string;
  result_count: number;
  timestamp: number;
  created_at: string;
}

export interface SolidotCacheJson {
  id: string;
  query: string;
  results: SolidotNewsItem[];
  result_count: number;
  timestamp: number;
  created_at: string;
}

function toSolidotCacheJson(row: DbSolidotCache): SolidotCacheJson {
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

// ---------------------------------------------------------------------------
// Jin10 Queries
// ---------------------------------------------------------------------------

export function createJin10Cache(data: {
  results: Jin10NewsItem[];
}): Jin10CacheJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.getTime();
  const created_at = now.toISOString();
  const query = "latest"; // Always use "latest" for Jin10
  const resultsJson = JSON.stringify(data.results);
  const result_count = data.results.length;

  db.prepare(
    `INSERT INTO jin10_cache (id, query, results, result_count, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, query, resultsJson, result_count, timestamp, created_at);

  return getJin10CacheById(id)!;
}

export function getJin10Cache(): Jin10CacheJson | undefined {
  const db = getDb();
  const query = "latest";
  const row = db
    .prepare(
      "SELECT * FROM jin10_cache WHERE query = ? ORDER BY timestamp DESC LIMIT 1"
    )
    .get(query) as DbJin10Cache | undefined;
  return row ? toJin10CacheJson(row) : undefined;
}

function getJin10CacheById(id: string): Jin10CacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM jin10_cache WHERE id = ?")
    .get(id) as DbJin10Cache | undefined;
  return row ? toJin10CacheJson(row) : undefined;
}

export function deleteExpiredJin10Cache(beforeTimestamp: number): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM jin10_cache WHERE timestamp < ?")
    .run(beforeTimestamp);
  return result.changes;
}

// ---------------------------------------------------------------------------
// SOLIDOT Queries
// ---------------------------------------------------------------------------

export function createSolidotCache(data: {
  results: SolidotNewsItem[];
}): SolidotCacheJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.getTime();
  const created_at = now.toISOString();
  const query = "latest"; // Always use "latest" for SOLIDOT
  const resultsJson = JSON.stringify(data.results);
  const result_count = data.results.length;

  db.prepare(
    `INSERT INTO solidot_cache (id, query, results, result_count, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, query, resultsJson, result_count, timestamp, created_at);

  const result = getSolidotCacheById(id);
  if (!result) {
    throw new Error(`Failed to retrieve newly created cache entry ${id}`);
  }
  return result;
}

export function getSolidotCache(): SolidotCacheJson | undefined {
  const db = getDb();
  const query = "latest";
  const row = db
    .prepare(
      "SELECT * FROM solidot_cache WHERE query = ? ORDER BY timestamp DESC LIMIT 1"
    )
    .get(query) as DbSolidotCache | undefined;
  return row ? toSolidotCacheJson(row) : undefined;
}

function getSolidotCacheById(id: string): SolidotCacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM solidot_cache WHERE id = ?")
    .get(id) as DbSolidotCache | undefined;
  return row ? toSolidotCacheJson(row) : undefined;
}

export function deleteExpiredSolidotCache(beforeTimestamp: number): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM solidot_cache WHERE timestamp < ?")
    .run(beforeTimestamp);
  return result.changes;
}
