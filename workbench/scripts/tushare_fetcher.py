"""Data fetcher for Tushare API with dry-run mock mode.

Usage:
    python tushare_fetcher.py --dry-run              # Use mock data (default)
    python tushare_fetcher.py --mode daily            # Fetch daily OHLCV
    python tushare_fetcher.py --mode history          # Fetch full history
    python tushare_fetcher.py --mode fundamental      # Fetch fundamentals
    python tushare_fetcher.py --start 20210101 --end 20241231

When TUSHARE_TOKEN env var is set, uses real tushare API.
Otherwise falls back to mock data.
"""

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

# Add scripts dir to path for mock_data import
sys.path.insert(0, str(Path(__file__).parent))
from mock_data import (
    generate_ohlcv,
    generate_stock_basic,
    generate_fundamentals,
    get_stock_codes,
)

DB_PATH = Path("/Users/ccnas/DEVELOPMENT/shared-data/tushare/tushare.db")
BENCHMARK_CODES = ["000300.SH", "000905.SH", "000852.SH"]


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS daily_ohlcv (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            pre_close REAL,
            pct_chg REAL,
            vol INTEGER,
            amount REAL,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_ohlcv_date ON daily_ohlcv(trade_date);

        CREATE TABLE IF NOT EXISTS stock_basic (
            ts_code TEXT PRIMARY KEY,
            name TEXT,
            industry TEXT,
            market TEXT,
            list_date TEXT
        );

        CREATE TABLE IF NOT EXISTS fina_indicator (
            ts_code TEXT NOT NULL,
            end_date TEXT NOT NULL,
            pe REAL,
            pb REAL,
            ps REAL,
            roe REAL,
            roa REAL,
            revenue_yoy REAL,
            profit_yoy REAL,
            debt_to_equity REAL,
            dividend_yield REAL,
            total_mv REAL,
            PRIMARY KEY (ts_code, end_date)
        );
    """)


def migrate_schema(conn: sqlite3.Connection) -> None:
    """Add pre_close and pct_chg columns to existing databases."""
    cursor = conn.execute("PRAGMA table_info(daily_ohlcv)")
    columns = {row[1] for row in cursor.fetchall()}
    if "pre_close" not in columns:
        conn.execute("ALTER TABLE daily_ohlcv ADD COLUMN pre_close REAL")
        print("  Migrated: added pre_close column to daily_ohlcv")
    if "pct_chg" not in columns:
        conn.execute("ALTER TABLE daily_ohlcv ADD COLUMN pct_chg REAL")
        print("  Migrated: added pct_chg column to daily_ohlcv")


def populate_mock_data(
    conn: sqlite3.Connection,
    start_date: str = "20210101",
    end_date: str = "20241231",
    mode: str = "history",
) -> None:
    codes = get_stock_codes()
    print(f"Populating mock data for {len(codes)} stocks ({start_date}–{end_date})...")

    # Stock basic info
    basic_df = generate_stock_basic(codes)
    for _, row in basic_df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO stock_basic (ts_code, name, industry, market, list_date) VALUES (?, ?, ?, ?, ?)",
            (row["ts_code"], row["name"], row["industry"], row["market"], row["list_date"]),
        )
    print(f"  Inserted {len(basic_df)} stock_basic records")

    if mode in ("daily", "history"):
        total_ohlcv = 0
        for i, code in enumerate(codes):
            df = generate_ohlcv(code, start_date, end_date)
            for _, row in df.iterrows():
                conn.execute(
                    "INSERT OR REPLACE INTO daily_ohlcv (ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (row["ts_code"], row["trade_date"], row["open"], row["high"], row["low"], row["close"], row.get("pre_close"), row.get("pct_chg"), int(row["vol"]), row["amount"]),
                )
            total_ohlcv += len(df)
            if (i + 1) % 10 == 0:
                print(f"  OHLCV: {i+1}/{len(codes)} stocks done")
                conn.commit()

        for code in BENCHMARK_CODES:
            df = generate_ohlcv(code, start_date, end_date)
            for _, row in df.iterrows():
                conn.execute(
                    "INSERT OR REPLACE INTO daily_ohlcv (ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (row["ts_code"], row["trade_date"], row["open"], row["high"], row["low"], row["close"], row.get("pre_close"), row.get("pct_chg"), int(row["vol"]), row["amount"]),
                )
            total_ohlcv += len(df)
        conn.commit()
        print(f"  Inserted {total_ohlcv} daily_ohlcv records (including {len(BENCHMARK_CODES)} benchmark series)")

    if mode in ("fundamental", "history"):
        total_fina = 0
        for code in codes:
            df = generate_fundamentals(code, start_date, end_date)
            for _, row in df.iterrows():
                conn.execute(
                    "INSERT OR REPLACE INTO fina_indicator (ts_code, end_date, pe, pb, ps, roe, roa, revenue_yoy, profit_yoy, debt_to_equity, dividend_yield, total_mv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (row["ts_code"], row["end_date"], row["pe"], row["pb"], row["ps"], row["roe"], row["roa"], row["revenue_yoy"], row["profit_yoy"], row["debt_to_equity"], row["dividend_yield"], row["total_mv"]),
                )
            total_fina += len(df)
        conn.commit()
        print(f"  Inserted {total_fina} fina_indicator records")

    print("Mock data population complete.")


def fetch_real_data(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
    mode: str,
    limit: int = 0,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    if mode in ("daily", "history"):
        # Fetch stock list
        stock_df = pro.stock_basic(exchange="", list_status="L", fields="ts_code,name,industry,market,list_date")
        for _, row in stock_df.iterrows():
            conn.execute(
                "INSERT OR REPLACE INTO stock_basic (ts_code, name, industry, market, list_date) VALUES (?, ?, ?, ?, ?)",
                (row["ts_code"], row["name"], row.get("industry", ""), row.get("market", ""), row.get("list_date", "")),
            )
        conn.commit()
        print(f"  Fetched {len(stock_df)} stocks from Tushare")

        # Fetch daily OHLCV with rate limiting (max 480/min to stay under 500/min)
        codes = stock_df["ts_code"].tolist()
        if limit > 0:
            codes = codes[:limit]
        total = len(codes)
        print(f"  Fetching daily OHLCV for {total} stocks (rate limit: 480/min)")

        BATCH_SIZE = 480
        batch_start_time = time.time()
        batch_count = 0

        for i, code in enumerate(codes):
            try:
                df = pro.daily(ts_code=code, start_date=start_date, end_date=end_date)
                if df is not None and len(df) > 0:
                    for _, row in df.iterrows():
                        conn.execute(
                            "INSERT OR REPLACE INTO daily_ohlcv (ts_code, trade_date, open, high, low, close, vol, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            (row["ts_code"], row["trade_date"], row["open"], row["high"], row["low"], row["close"], int(row["vol"]), row["amount"]),
                        )
                batch_count += 1

                # Rate limiting: after every BATCH_SIZE calls, ensure 60s have passed
                if batch_count >= BATCH_SIZE:
                    conn.commit()
                    elapsed = time.time() - batch_start_time
                    if elapsed < 62:
                        wait = 62 - elapsed
                        print(f"  Rate limit: {i+1}/{total} done, waiting {wait:.0f}s...")
                        time.sleep(wait)
                    batch_start_time = time.time()
                    batch_count = 0

                if (i + 1) % 100 == 0:
                    conn.commit()
                    print(f"  Daily OHLCV: {i+1}/{total} stocks done")
            except Exception as e:
                print(f"  Warning: failed to fetch {code}: {e}")
                # If rate limited, wait and retry once
                if "每分钟" in str(e) or "too many" in str(e).lower():
                    print("  Rate limited, waiting 65s...")
                    time.sleep(65)
                    batch_start_time = time.time()
                    batch_count = 0
                    try:
                        df = pro.daily(ts_code=code, start_date=start_date, end_date=end_date)
                        if df is not None and len(df) > 0:
                            for _, row in df.iterrows():
                                conn.execute(
                                    "INSERT OR REPLACE INTO daily_ohlcv (ts_code, trade_date, open, high, low, close, vol, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                    (row["ts_code"], row["trade_date"], row["open"], row["high"], row["low"], row["close"], int(row["vol"]), row["amount"]),
                                )
                        batch_count += 1
                    except Exception as e2:
                        print(f"  Warning: retry also failed for {code}: {e2}")

        for code in BENCHMARK_CODES:
            try:
                df = pro.index_daily(ts_code=code, start_date=start_date, end_date=end_date)
                if df is not None and len(df) > 0:
                    for _, row in df.iterrows():
                        conn.execute(
                            "INSERT OR REPLACE INTO daily_ohlcv (ts_code, trade_date, open, high, low, close, vol, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            (row["ts_code"], row["trade_date"], row["open"], row["high"], row["low"], row["close"], int(row["vol"]), row["amount"]),
                        )
            except Exception as e:
                print(f"  Warning: failed to fetch benchmark {code}: {e}")
        conn.commit()
        print(f"  Daily OHLCV complete: {total} stocks + {len(BENCHMARK_CODES)} benchmarks")

    if mode in ("fundamental", "history"):
        print("  Fundamental data fetching via Tushare not yet implemented (requires higher-tier API access)")

    print("Real data fetch complete.")


def main():
    parser = argparse.ArgumentParser(description="Tushare data fetcher")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Use mock data instead of real API")
    parser.add_argument("--mode", choices=["daily", "history", "fundamental"], default="history", help="Fetch type")
    parser.add_argument("--start", default="20210101", help="Start date (YYYYMMDD)")
    parser.add_argument("--end", default="20241231", help="End date (YYYYMMDD)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of stocks to fetch (0 = default)")
    args = parser.parse_args()

    token = os.environ.get("TUSHARE_TOKEN", "")
    use_mock = args.dry_run or not token

    conn = get_connection()
    init_schema(conn)
    migrate_schema(conn)

    if use_mock:
        print("Running in DRY-RUN mode (mock data)")
        populate_mock_data(conn, args.start, args.end, args.mode)
    else:
        print(f"Fetching real data from Tushare (mode={args.mode}, limit={args.limit or 'default'})")
        fetch_real_data(conn, token, args.start, args.end, args.mode, args.limit)

    conn.close()
    print(f"Database: {DB_PATH}")


if __name__ == "__main__":
    main()
