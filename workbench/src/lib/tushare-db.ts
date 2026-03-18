import Database from "better-sqlite3";
import { existsSync } from "fs";

const TUSHARE_DB_PATH = "/Users/ccnas/DEVELOPMENT/shared-data/tushare/tushare.db";

let _tushareDb: Database.Database | null = null;

export function getTushareDb(): Database.Database | null {
  if (_tushareDb) return _tushareDb;
  if (!existsSync(TUSHARE_DB_PATH)) return null;

  _tushareDb = new Database(TUSHARE_DB_PATH, { readonly: true });
  _tushareDb.pragma("journal_mode = WAL");
  return _tushareDb;
}

export interface OhlcvRow {
  ts_code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number;
}

export interface StockBasic {
  ts_code: string;
  name: string;
  industry: string;
  market: string;
  list_date: string;
}

export interface FinaIndicator {
  ts_code: string;
  end_date: string;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  roa: number;
  revenue_yoy: number;
  profit_yoy: number;
  debt_to_equity: number;
  dividend_yield: number;
  total_mv: number;
}

export function getOhlcv(code: string, startDate: string, endDate: string): OhlcvRow[] {
  const db = getTushareDb();
  if (!db) return [];
  return db.prepare(
    "SELECT * FROM daily_ohlcv WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ? ORDER BY trade_date"
  ).all(code, startDate, endDate) as OhlcvRow[];
}

export function getStockList(): StockBasic[] {
  const db = getTushareDb();
  if (!db) return [];
  return db.prepare("SELECT * FROM stock_basic ORDER BY ts_code").all() as StockBasic[];
}

export function getDataSummary(): {
  stockCount: number;
  ohlcvCount: number;
  finaCount: number;
  dailyBasicCount: number;
  dateRange: { min: string; max: string } | null;
} {
  const db = getTushareDb();
  if (!db) {
    return { stockCount: 0, ohlcvCount: 0, finaCount: 0, dailyBasicCount: 0, dateRange: null };
  }

  const stockCount = (db.prepare("SELECT COUNT(*) as cnt FROM stock_basic").get() as { cnt: number }).cnt;
  const ohlcvCount = (db.prepare("SELECT COUNT(*) as cnt FROM daily_ohlcv").get() as { cnt: number }).cnt;
  const finaCount = (db.prepare("SELECT COUNT(*) as cnt FROM fina_indicator").get() as { cnt: number }).cnt;

  let dailyBasicCount = 0;
  try {
    dailyBasicCount = (db.prepare("SELECT COUNT(*) as cnt FROM daily_basic").get() as { cnt: number }).cnt;
  } catch { /* table may not exist yet */ }

  const range = db.prepare(
    "SELECT MIN(trade_date) as min_date, MAX(trade_date) as max_date FROM daily_ohlcv"
  ).get() as { min_date: string | null; max_date: string | null };

  return {
    stockCount,
    ohlcvCount,
    finaCount,
    dailyBasicCount,
    dateRange: range.min_date ? { min: range.min_date, max: range.max_date! } : null,
  };
}

export function getFundamentals(code: string): FinaIndicator[] {
  const db = getTushareDb();
  if (!db) return [];
  return db.prepare(
    "SELECT * FROM fina_indicator WHERE ts_code = ? ORDER BY end_date"
  ).all(code) as FinaIndicator[];
}
