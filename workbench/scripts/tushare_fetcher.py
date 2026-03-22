"""Data fetcher for Tushare API with dry-run mock mode.

Usage:
    python tushare_fetcher.py --dry-run              # Use mock data (default)
    python tushare_fetcher.py --mode daily            # Fetch daily OHLCV
    python tushare_fetcher.py --mode history          # Fetch full history
    python tushare_fetcher.py --mode fundamental      # Fetch fundamentals
    python tushare_fetcher.py --mode incremental      # Refresh latest cached date through today
    python tushare_fetcher.py --mode backfill-daily   # Backfill pre_close/pct_chg by date
    python tushare_fetcher.py --mode stk-limit        # Fetch daily limit prices
    python tushare_fetcher.py --mode moneyflow        # Fetch daily money-flow data
    python tushare_fetcher.py --mode margin-detail    # Fetch daily margin detail
    python tushare_fetcher.py --mode adj-factor       # Fetch daily adjustment factors
    python tushare_fetcher.py --mode hk-hold          # Fetch northbound holding data
    python tushare_fetcher.py --mode top-list         # Fetch dragon-tiger list detail
    python tushare_fetcher.py --mode holder-trade     # Fetch holder trade disclosures
    python tushare_fetcher.py --mode top10-floatholders # Fetch top-10 float-holder detail
    python tushare_fetcher.py --start 20210101 --end 20241231

When TUSHARE_TOKEN env var is set, uses real tushare API.
Otherwise falls back to mock data.
"""

import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

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


def format_yyyymmdd(value: datetime) -> str:
    return value.strftime("%Y%m%d")


def parse_yyyymmdd(value: str) -> datetime:
    return datetime.strptime(value, "%Y%m%d")


def iter_calendar_dates(start_date: str, end_date: str) -> list[str]:
    start = parse_yyyymmdd(start_date)
    end = parse_yyyymmdd(end_date)
    current = start
    dates = []

    while current <= end:
        dates.append(format_yyyymmdd(current))
        current += timedelta(days=1)

    return dates


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

        CREATE TABLE IF NOT EXISTS index_daily (
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
            source TEXT NOT NULL DEFAULT 'tushare_index_daily',
            fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_index_daily_date ON index_daily(trade_date);

        CREATE TABLE IF NOT EXISTS stock_basic (
            ts_code TEXT PRIMARY KEY,
            name TEXT,
            industry TEXT,
            market TEXT,
            list_date TEXT
        );

        CREATE TABLE IF NOT EXISTS daily_basic (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            pe REAL,
            pe_ttm REAL,
            pb REAL,
            ps REAL,
            ps_ttm REAL,
            dv_ratio REAL,
            dv_ttm REAL,
            total_share REAL,
            float_share REAL,
            free_share REAL,
            total_mv REAL,
            circ_mv REAL,
            turnover_rate REAL,
            turnover_rate_f REAL,
            volume_ratio REAL,
            PRIMARY KEY (ts_code, trade_date)
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

        CREATE TABLE IF NOT EXISTS stk_limit (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            pre_close REAL,
            up_limit REAL,
            down_limit REAL,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_stk_limit_date ON stk_limit(trade_date);

        CREATE TABLE IF NOT EXISTS moneyflow (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            buy_lg_amount REAL,
            sell_lg_amount REAL,
            buy_elg_amount REAL,
            sell_elg_amount REAL,
            net_mf_amount REAL,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_moneyflow_date ON moneyflow(trade_date);

        CREATE TABLE IF NOT EXISTS margin_detail (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            rqye REAL,
            rzmre REAL,
            rzrqye REAL,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_margin_detail_date ON margin_detail(trade_date);

        CREATE TABLE IF NOT EXISTS adj_factor (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            adj_factor REAL,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_adj_factor_date ON adj_factor(trade_date);

        CREATE TABLE IF NOT EXISTS hk_hold (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            vol REAL,
            ratio REAL,
            exchange TEXT,
            PRIMARY KEY (ts_code, trade_date)
        );

        CREATE INDEX IF NOT EXISTS idx_hk_hold_date ON hk_hold(trade_date);

        CREATE TABLE IF NOT EXISTS top_list (
            ts_code TEXT NOT NULL,
            trade_date TEXT NOT NULL,
            net_rate REAL,
            net_amount REAL,
            amount_rate REAL,
            reason TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (ts_code, trade_date, reason)
        );

        CREATE INDEX IF NOT EXISTS idx_top_list_date ON top_list(trade_date);

        CREATE TABLE IF NOT EXISTS holder_trade (
            ts_code TEXT NOT NULL,
            ann_date TEXT NOT NULL,
            holder_name TEXT NOT NULL,
            in_de TEXT,
            change_ratio REAL,
            begin_date TEXT,
            close_date TEXT,
            PRIMARY KEY (ts_code, ann_date, holder_name, in_de, begin_date, close_date)
        );

        CREATE INDEX IF NOT EXISTS idx_holder_trade_ann_date ON holder_trade(ann_date);

        CREATE TABLE IF NOT EXISTS top10_floatholders (
            ts_code TEXT NOT NULL,
            ann_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            holder_name TEXT NOT NULL,
            hold_float_ratio REAL,
            PRIMARY KEY (ts_code, end_date, holder_name)
        );

        CREATE INDEX IF NOT EXISTS idx_top10_floatholders_end_date ON top10_floatholders(end_date);
    """)
    ensure_analytic_indexes(conn)


def migrate_schema(conn: sqlite3.Connection) -> None:
    """Apply additive schema updates for existing databases."""
    cursor = conn.execute("PRAGMA table_info(daily_ohlcv)")
    columns = {row[1] for row in cursor.fetchall()}
    if "pre_close" not in columns:
        conn.execute("ALTER TABLE daily_ohlcv ADD COLUMN pre_close REAL")
        print("  Migrated: added pre_close column to daily_ohlcv")
    if "pct_chg" not in columns:
        conn.execute("ALTER TABLE daily_ohlcv ADD COLUMN pct_chg REAL")
        print("  Migrated: added pct_chg column to daily_ohlcv")
    ensure_analytic_indexes(conn)


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def ensure_analytic_indexes(conn: sqlite3.Connection) -> None:
    if table_exists(conn, "daily_basic"):
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_daily_basic_trade_date_total_mv
            ON daily_basic(trade_date, total_mv DESC, ts_code)
            WHERE total_mv IS NOT NULL
            """
        )

    if table_exists(conn, "fina_indicator"):
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_fina_indicator_end_date_total_mv
            ON fina_indicator(end_date, total_mv DESC, ts_code)
            WHERE total_mv IS NOT NULL
            """
        )


def refresh_stock_basic(conn: sqlite3.Connection, pro):
    stock_df = pro.stock_basic(exchange="", list_status="L", fields="ts_code,name,industry,market,list_date")
    for _, row in stock_df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO stock_basic (ts_code, name, industry, market, list_date) VALUES (?, ?, ?, ?, ?)",
            (row["ts_code"], row["name"], row.get("industry", ""), row.get("market", ""), row.get("list_date", "")),
        )
    conn.commit()
    print(f"  Fetched {len(stock_df)} stocks from Tushare")
    return stock_df


def upsert_daily_ohlcv_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO daily_ohlcv "
            "(ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["trade_date"],
                row["open"],
                row["high"],
                row["low"],
                row["close"],
                row.get("pre_close"),
                row.get("pct_chg"),
                int(row["vol"]),
                row["amount"],
            ),
        )


def upsert_daily_basic_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO daily_basic "
            "("
            "ts_code, trade_date, pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm, "
            "total_share, float_share, free_share, total_mv, circ_mv, "
            "turnover_rate, turnover_rate_f, volume_ratio"
            ") "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["trade_date"],
                row.get("pe"),
                row.get("pe_ttm"),
                row.get("pb"),
                row.get("ps"),
                row.get("ps_ttm"),
                row.get("dv_ratio"),
                row.get("dv_ttm"),
                row.get("total_share"),
                row.get("float_share"),
                row.get("free_share"),
                row.get("total_mv"),
                row.get("circ_mv"),
                row.get("turnover_rate"),
                row.get("turnover_rate_f"),
                row.get("volume_ratio"),
            ),
        )


def upsert_index_daily_rows(conn: sqlite3.Connection, df, source: str = "tushare_index_daily") -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO index_daily "
            "(ts_code, trade_date, open, high, low, close, pre_close, pct_chg, vol, amount, source, fetched_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            (
                row["ts_code"],
                row["trade_date"],
                row["open"],
                row["high"],
                row["low"],
                row["close"],
                row.get("pre_close"),
                row.get("pct_chg"),
                int(row["vol"]),
                row["amount"],
                source,
            ),
        )


def upsert_moneyflow_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO moneyflow "
            "(ts_code, trade_date, buy_lg_amount, sell_lg_amount, buy_elg_amount, sell_elg_amount, net_mf_amount) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["trade_date"],
                row.get("buy_lg_amount"),
                row.get("sell_lg_amount"),
                row.get("buy_elg_amount"),
                row.get("sell_elg_amount"),
                row.get("net_mf_amount"),
            ),
        )


def upsert_margin_detail_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO margin_detail "
            "(ts_code, trade_date, rqye, rzmre, rzrqye) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["trade_date"],
                row.get("rqye"),
                row.get("rzmre"),
                row.get("rzrqye"),
            ),
        )


def upsert_adj_factor_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO adj_factor (ts_code, trade_date, adj_factor) VALUES (?, ?, ?)",
            (row["ts_code"], row["trade_date"], row.get("adj_factor")),
        )


def upsert_hk_hold_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO hk_hold (ts_code, trade_date, vol, ratio, exchange) VALUES (?, ?, ?, ?, ?)",
            (row["ts_code"], row["trade_date"], row.get("vol"), row.get("ratio"), row.get("exchange")),
        )


def upsert_top_list_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO top_list (ts_code, trade_date, net_rate, net_amount, amount_rate, reason) VALUES (?, ?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["trade_date"],
                row.get("net_rate"),
                row.get("net_amount"),
                row.get("amount_rate"),
                row.get("reason", ""),
            ),
        )


def upsert_holder_trade_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO holder_trade "
            "(ts_code, ann_date, holder_name, in_de, change_ratio, begin_date, close_date) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["ann_date"],
                row["holder_name"],
                row.get("in_de"),
                row.get("change_ratio"),
                row.get("begin_date"),
                row.get("close_date"),
            ),
        )


def upsert_top10_floatholders_rows(conn: sqlite3.Connection, df) -> None:
    for _, row in df.iterrows():
        conn.execute(
            "INSERT OR REPLACE INTO top10_floatholders "
            "(ts_code, ann_date, end_date, holder_name, hold_float_ratio) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                row["ts_code"],
                row["ann_date"],
                row["end_date"],
                row["holder_name"],
                row.get("hold_float_ratio"),
            ),
        )


def purge_benchmark_rows_from_daily_ohlcv(conn: sqlite3.Connection) -> int:
    placeholders = ",".join("?" for _ in BENCHMARK_CODES)
    cursor = conn.execute(
        f"DELETE FROM daily_ohlcv WHERE ts_code IN ({placeholders})",
        BENCHMARK_CODES,
    )
    return cursor.rowcount


def fetch_benchmark_data(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> int:
    total_rows = 0
    for code in BENCHMARK_CODES:
        df = pro.index_daily(ts_code=code, start_date=start_date, end_date=end_date)
        conn.execute(
            "DELETE FROM index_daily WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ?",
            (code, start_date, end_date),
        )
        if df is None or len(df) == 0:
            continue
        upsert_index_daily_rows(conn, df)
        total_rows += len(df)
    if total_rows > 0:
        removed = purge_benchmark_rows_from_daily_ohlcv(conn)
        if removed > 0:
            print(f"  Removed {removed} benchmark rows from daily_ohlcv after index refresh")
    return total_rows


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
            upsert_daily_ohlcv_rows(conn, df)
            total_ohlcv += len(df)
            if (i + 1) % 10 == 0:
                print(f"  OHLCV: {i+1}/{len(codes)} stocks done")
                conn.commit()

        conn.commit()
        print(f"  Inserted {total_ohlcv} stock daily_ohlcv records")
        print("  Skipped benchmark index generation in mock mode")

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
        stock_df = refresh_stock_basic(conn, pro)

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
                    upsert_daily_ohlcv_rows(conn, df)
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
                            upsert_daily_ohlcv_rows(conn, df)
                        batch_count += 1
                    except Exception as e2:
                        print(f"  Warning: retry also failed for {code}: {e2}")

        try:
            benchmark_rows = fetch_benchmark_data(conn, pro, start_date, end_date)
        except Exception as e:
            print(f"  Warning: failed to fetch benchmark indexes: {e}")
            benchmark_rows = 0
        try:
            if limit > 0:
                daily_basic_rows, daily_basic_dates = fetch_daily_basic_for_codes(conn, pro, codes, start_date, end_date)
                daily_basic_scope = "stocks"
            else:
                daily_basic_rows, daily_basic_dates = fetch_daily_basic_by_trade_date(conn, pro, start_date, end_date)
                daily_basic_scope = "trade dates"
        except Exception as e:
            print(f"  Warning: failed to fetch daily_basic data: {e}")
            daily_basic_rows = 0
            daily_basic_dates = 0
            daily_basic_scope = "trade dates"
        conn.commit()
        print(
            "  Daily OHLCV complete: "
            f"{total} stocks + {benchmark_rows} benchmark index rows + "
            f"{daily_basic_rows} daily_basic rows across {daily_basic_dates} {daily_basic_scope}"
        )

    elif mode == "benchmark-daily":
        benchmark_rows = fetch_benchmark_data(conn, pro, start_date, end_date)
        conn.commit()
        print(f"  Benchmark index refresh complete: {benchmark_rows} rows")

    if mode in ("fundamental", "history"):
        print("  Fundamental data fetching via Tushare not yet implemented (requires higher-tier API access)")

    print("Real data fetch complete.")


def fetch_daily_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing daily OHLCV by trade date for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 480

    for i, trade_date in enumerate(dates):
        try:
            df = pro.daily(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM daily_ohlcv WHERE trade_date = ?", (trade_date,))
                upsert_daily_ohlcv_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  Daily by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch daily data for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower():
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def resolve_incremental_start_date(conn: sqlite3.Connection, end_date: str) -> str:
    max_dates: list[str] = []

    for table_name in ("daily_ohlcv", "daily_basic"):
        if not table_exists(conn, table_name):
            continue
        row = conn.execute(f"SELECT MAX(trade_date) FROM {table_name}").fetchone()
        max_trade_date = row[0] if row and row[0] else None
        if max_trade_date:
            max_dates.append(max_trade_date)

    if not max_dates:
        return end_date

    return min(min(max_dates), end_date)


def fetch_daily_basic_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing daily_basic data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.daily_basic(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM daily_basic WHERE trade_date = ?", (trade_date,))
                upsert_daily_basic_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} daily_basic dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  daily_basic by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch daily_basic for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_daily_basic_for_codes(
    conn: sqlite3.Connection,
    pro,
    codes: list[str],
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    if not codes:
        return 0, 0

    print(f"  Refreshing daily_basic data for {len(codes)} selected stocks")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    batch_size = 480

    for i, code in enumerate(codes):
        try:
            df = pro.daily_basic(ts_code=code, start_date=start_date, end_date=end_date)
            conn.execute(
                "DELETE FROM daily_basic WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ?",
                (code, start_date, end_date),
            )
            if df is not None and len(df) > 0:
                upsert_daily_basic_rows(conn, df)
                total_rows += len(df)
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(codes)} daily_basic stocks done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 100 == 0 or i == len(codes) - 1:
                conn.commit()
                print(f"  daily_basic by code: {i+1}/{len(codes)} stocks done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch daily_basic for {code}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, len(codes)


def fetch_stk_limit_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing stk_limit data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.stk_limit(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM stk_limit WHERE trade_date = ?", (trade_date,))
                for _, row in df.iterrows():
                    conn.execute(
                        "INSERT OR REPLACE INTO stk_limit (ts_code, trade_date, pre_close, up_limit, down_limit) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (row["ts_code"], row["trade_date"], row.get("pre_close"), row["up_limit"], row["down_limit"]),
                    )
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} stk_limit dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  stk_limit by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch stk_limit for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_moneyflow_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing moneyflow data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.moneyflow(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM moneyflow WHERE trade_date = ?", (trade_date,))
                upsert_moneyflow_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} moneyflow dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  moneyflow by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch moneyflow for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_incremental_update(
    conn: sqlite3.Connection,
    token: str,
    start_date: Optional[str],
    end_date: str,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    effective_start_date = start_date or resolve_incremental_start_date(conn, end_date)
    print(f"Running incremental Tushare update ({effective_start_date}–{end_date})")

    refresh_stock_basic(conn, pro)
    daily_rows, daily_dates = fetch_daily_by_trade_date(conn, pro, effective_start_date, end_date)
    try:
        daily_basic_rows, daily_basic_dates = fetch_daily_basic_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh daily_basic data: {e}")
        daily_basic_rows = 0
        daily_basic_dates = 0

    try:
        benchmark_rows = fetch_benchmark_data(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to fetch benchmark indexes: {e}")
        benchmark_rows = 0

    try:
        stk_limit_rows, stk_limit_dates = fetch_stk_limit_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh stk_limit data: {e}")
        stk_limit_rows = 0
        stk_limit_dates = 0

    try:
        moneyflow_rows, moneyflow_dates = fetch_moneyflow_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh moneyflow data: {e}")
        moneyflow_rows = 0
        moneyflow_dates = 0

    try:
        margin_rows, margin_dates = fetch_margin_detail_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh margin_detail data: {e}")
        margin_rows = 0
        margin_dates = 0

    try:
        adj_rows, adj_dates = fetch_adj_factor_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh adj_factor data: {e}")
        adj_rows = 0
        adj_dates = 0

    try:
        hk_hold_rows, hk_hold_dates = fetch_hk_hold_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh hk_hold data: {e}")
        hk_hold_rows = 0
        hk_hold_dates = 0

    try:
        top_list_rows, top_list_dates = fetch_top_list_by_trade_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh top_list data: {e}")
        top_list_rows = 0
        top_list_dates = 0

    try:
        holder_trade_rows, holder_trade_dates = fetch_holder_trade_by_ann_date(conn, pro, effective_start_date, end_date)
    except Exception as e:
        print(f"  Warning: failed to refresh holder_trade data: {e}")
        holder_trade_rows = 0
        holder_trade_dates = 0

    print(
        "Incremental update complete: "
        f"{daily_rows} daily rows across {daily_dates} trade dates, "
        f"{daily_basic_rows} daily_basic rows across {daily_basic_dates} trade dates, "
        f"{benchmark_rows} benchmark rows, "
        f"{stk_limit_rows} stk_limit rows across {stk_limit_dates} trade dates, "
        f"{moneyflow_rows} moneyflow rows across {moneyflow_dates} trade dates, "
        f"{margin_rows} margin_detail rows across {margin_dates} trade dates, "
        f"{adj_rows} adj_factor rows across {adj_dates} trade dates, "
        f"{hk_hold_rows} hk_hold rows across {hk_hold_dates} trade dates, "
        f"{top_list_rows} top_list rows across {top_list_dates} trade dates, "
        f"{holder_trade_rows} holder_trade rows across {holder_trade_dates} calendar dates"
    )


def backfill_daily_by_date(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    """Backfill pre_close/pct_chg into existing daily_ohlcv by fetching daily API per trade_date."""
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    # Get all trade dates that need backfilling
    rows = conn.execute(
        "SELECT DISTINCT trade_date FROM daily_ohlcv "
        "WHERE trade_date >= ? AND trade_date <= ? AND pre_close IS NULL "
        "ORDER BY trade_date",
        (start_date, end_date),
    ).fetchall()
    dates = [r[0] for r in rows]

    if not dates:
        print("  No dates need backfilling (pre_close already populated)")
        return

    print(f"  Backfilling pre_close/pct_chg for {len(dates)} trade dates")
    print(f"  Rate limit: 480 calls/min (daily API)")

    BATCH_SIZE = 480
    batch_start_time = time.time()
    batch_count = 0
    total_updated = 0

    for i, trade_date in enumerate(dates):
        try:
            df = pro.daily(trade_date=trade_date)
            if df is not None and len(df) > 0:
                for _, row in df.iterrows():
                    conn.execute(
                        "UPDATE daily_ohlcv SET pre_close = ?, pct_chg = ? "
                        "WHERE ts_code = ? AND trade_date = ? AND pre_close IS NULL",
                        (row.get("pre_close"), row.get("pct_chg"), row["ts_code"], row["trade_date"]),
                    )
                total_updated += len(df)
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 100 == 0:
                conn.commit()
                print(f"  Backfill: {i+1}/{len(dates)} dates done ({total_updated} rows updated)")
        except Exception as e:
            print(f"  Warning: failed to fetch date {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower():
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  Backfill complete: {total_updated} rows updated across {len(dates)} dates")


def fetch_stk_limit(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    """Fetch daily limit-up/limit-down prices from stk_limit API (requires 2000 score)."""
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    # Get all trade dates in range from existing OHLCV data
    rows = conn.execute(
        "SELECT DISTINCT trade_date FROM daily_ohlcv "
        "WHERE trade_date >= ? AND trade_date <= ? "
        "ORDER BY trade_date",
        (start_date, end_date),
    ).fetchall()
    all_dates = [r[0] for r in rows]

    # Skip dates already fetched
    existing = conn.execute(
        "SELECT DISTINCT trade_date FROM stk_limit "
        "WHERE trade_date >= ? AND trade_date <= ?",
        (start_date, end_date),
    ).fetchall()
    existing_dates = {r[0] for r in existing}
    dates = [d for d in all_dates if d not in existing_dates]

    if not dates:
        print("  stk_limit data already up to date")
        return

    print(f"  Fetching stk_limit for {len(dates)} trade dates ({len(existing_dates)} already cached)")
    print(f"  stk_limit API: max 5800 records/call, rate limited per minute")

    # Use conservative rate limit since exact rate at 2000 score is unknown
    BATCH_SIZE = 200
    batch_start_time = time.time()
    batch_count = 0
    total_inserted = 0

    for i, trade_date in enumerate(dates):
        try:
            df = pro.stk_limit(trade_date=trade_date)
            if df is not None and len(df) > 0:
                for _, row in df.iterrows():
                    conn.execute(
                        "INSERT OR REPLACE INTO stk_limit (ts_code, trade_date, pre_close, up_limit, down_limit) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (row["ts_code"], row["trade_date"], row.get("pre_close"), row["up_limit"], row["down_limit"]),
                    )
                total_inserted += len(df)
            batch_count += 1

            if batch_count >= BATCH_SIZE:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 50 == 0:
                conn.commit()
                print(f"  stk_limit: {i+1}/{len(dates)} dates done ({total_inserted} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch stk_limit for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  stk_limit complete: {total_inserted} rows across {len(dates)} dates")


def fetch_moneyflow(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    """Fetch daily stock money-flow data from moneyflow API (requires 2000 score)."""
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    rows = conn.execute(
        "SELECT DISTINCT trade_date FROM daily_ohlcv "
        "WHERE trade_date >= ? AND trade_date <= ? "
        "ORDER BY trade_date",
        (start_date, end_date),
    ).fetchall()
    all_dates = [r[0] for r in rows]

    existing = conn.execute(
        "SELECT DISTINCT trade_date FROM moneyflow "
        "WHERE trade_date >= ? AND trade_date <= ?",
        (start_date, end_date),
    ).fetchall()
    existing_dates = {r[0] for r in existing}
    dates = [d for d in all_dates if d not in existing_dates]

    if not dates:
        print("  moneyflow data already up to date")
        return

    print(f"  Fetching moneyflow for {len(dates)} trade dates ({len(existing_dates)} already cached)")
    print("  moneyflow API: max 6000 records/call, rate limited per minute")

    batch_size = 200
    batch_start_time = time.time()
    batch_count = 0
    total_inserted = 0

    for i, trade_date in enumerate(dates):
        try:
            df = pro.moneyflow(trade_date=trade_date)
            if df is not None and len(df) > 0:
                upsert_moneyflow_rows(conn, df)
                total_inserted += len(df)
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 50 == 0:
                conn.commit()
                print(f"  moneyflow: {i+1}/{len(dates)} dates done ({total_inserted} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch moneyflow for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  moneyflow complete: {total_inserted} rows across {len(dates)} dates")


def fetch_margin_detail_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing margin_detail data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.margin_detail(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM margin_detail WHERE trade_date = ?", (trade_date,))
                upsert_margin_detail_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} margin_detail dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  margin_detail by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch margin_detail for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_margin_detail(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    """Fetch daily margin-detail data from margin_detail API (requires 2000 score)."""
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    rows = conn.execute(
        "SELECT DISTINCT trade_date FROM daily_ohlcv "
        "WHERE trade_date >= ? AND trade_date <= ? "
        "ORDER BY trade_date",
        (start_date, end_date),
    ).fetchall()
    all_dates = [r[0] for r in rows]

    existing = conn.execute(
        "SELECT DISTINCT trade_date FROM margin_detail "
        "WHERE trade_date >= ? AND trade_date <= ?",
        (start_date, end_date),
    ).fetchall()
    existing_dates = {r[0] for r in existing}
    dates = [d for d in all_dates if d not in existing_dates]

    if not dates:
        print("  margin_detail data already up to date")
        return

    print(f"  Fetching margin_detail for {len(dates)} trade dates ({len(existing_dates)} already cached)")
    print("  margin_detail API: max 6000 records/call, rate limited per minute")

    batch_size = 200
    batch_start_time = time.time()
    batch_count = 0
    total_inserted = 0

    for i, trade_date in enumerate(dates):
        try:
            df = pro.margin_detail(trade_date=trade_date)
            if df is not None and len(df) > 0:
                upsert_margin_detail_rows(conn, df)
                total_inserted += len(df)
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 50 == 0:
                conn.commit()
                print(f"  margin_detail: {i+1}/{len(dates)} dates done ({total_inserted} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch margin_detail for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  margin_detail complete: {total_inserted} rows across {len(dates)} dates")


def fetch_adj_factor_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing adj_factor data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.adj_factor(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM adj_factor WHERE trade_date = ?", (trade_date,))
                upsert_adj_factor_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} adj_factor dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  adj_factor by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch adj_factor for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_adj_factor(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    """Fetch daily adjusted-price factors from adj_factor API (requires 2000 score)."""
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)

    rows = conn.execute(
        "SELECT DISTINCT trade_date FROM daily_ohlcv "
        "WHERE trade_date >= ? AND trade_date <= ? "
        "ORDER BY trade_date",
        (start_date, end_date),
    ).fetchall()
    all_dates = [r[0] for r in rows]

    existing = conn.execute(
        "SELECT DISTINCT trade_date FROM adj_factor "
        "WHERE trade_date >= ? AND trade_date <= ?",
        (start_date, end_date),
    ).fetchall()
    existing_dates = {r[0] for r in existing}
    dates = [d for d in all_dates if d not in existing_dates]

    if not dates:
        print("  adj_factor data already up to date")
        return

    print(f"  Fetching adj_factor for {len(dates)} trade dates ({len(existing_dates)} already cached)")
    print("  adj_factor API: max 6000 records/call, rate limited per minute")

    batch_size = 200
    batch_start_time = time.time()
    batch_count = 0
    total_inserted = 0

    for i, trade_date in enumerate(dates):
        try:
            df = pro.adj_factor(trade_date=trade_date)
            if df is not None and len(df) > 0:
                upsert_adj_factor_rows(conn, df)
                total_inserted += len(df)
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 50 == 0:
                conn.commit()
                print(f"  adj_factor: {i+1}/{len(dates)} dates done ({total_inserted} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch adj_factor for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  adj_factor complete: {total_inserted} rows across {len(dates)} dates")


def fetch_hk_hold_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing hk_hold data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.hk_hold(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM hk_hold WHERE trade_date = ?", (trade_date,))
                upsert_hk_hold_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} hk_hold dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  hk_hold by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch hk_hold for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_top_list_by_trade_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing top_list data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, trade_date in enumerate(dates):
        try:
            df = pro.top_list(trade_date=trade_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM top_list WHERE trade_date = ?", (trade_date,))
                upsert_top_list_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} top_list dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  top_list by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch top_list for {trade_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_holder_trade_by_ann_date(
    conn: sqlite3.Connection,
    pro,
    start_date: str,
    end_date: str,
) -> tuple[int, int]:
    dates = iter_calendar_dates(start_date, end_date)
    if not dates:
        return 0, 0

    print(f"  Refreshing holder_trade data for {len(dates)} calendar days")

    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0
    populated_dates = 0
    batch_size = 200

    for i, ann_date in enumerate(dates):
        try:
            df = pro.stk_holdertrade(ann_date=ann_date)
            if df is not None and len(df) > 0:
                conn.execute("DELETE FROM holder_trade WHERE ann_date = ?", (ann_date,))
                upsert_holder_trade_rows(conn, df)
                total_rows += len(df)
                populated_dates += 1
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(dates)} holder_trade dates done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 20 == 0 or i == len(dates) - 1:
                conn.commit()
                print(f"  holder_trade by date: {i+1}/{len(dates)} dates done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch holder_trade for {ann_date}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    return total_rows, populated_dates


def fetch_hk_hold(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)
    rows, dates = fetch_hk_hold_by_trade_date(conn, pro, start_date, end_date)
    print(f"  hk_hold complete: {rows} rows across {dates} dates")


def fetch_top_list(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)
    rows, dates = fetch_top_list_by_trade_date(conn, pro, start_date, end_date)
    print(f"  top_list complete: {rows} rows across {dates} dates")


def fetch_holder_trade(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)
    rows, dates = fetch_holder_trade_by_ann_date(conn, pro, start_date, end_date)
    print(f"  holder_trade complete: {rows} rows across {dates} calendar dates")


def fetch_top10_floatholders(
    conn: sqlite3.Connection,
    token: str,
    start_date: str,
    end_date: str,
    limit: int = 0,
) -> None:
    try:
        import tushare as ts
    except ImportError:
        print("ERROR: tushare package not installed. Run: pip install tushare")
        sys.exit(1)

    pro = ts.pro_api(token)
    stock_rows = conn.execute("SELECT ts_code FROM stock_basic ORDER BY ts_code").fetchall()
    codes = [r[0] for r in stock_rows]
    if limit > 0:
        codes = codes[:limit]

    if not codes:
        print("  No stock codes available for top10_floatholders fetch")
        return

    print(f"  Fetching top10_floatholders for {len(codes)} stocks")
    batch_size = 200
    batch_start_time = time.time()
    batch_count = 0
    total_rows = 0

    for i, code in enumerate(codes):
        try:
            df = pro.top10_floatholders(ts_code=code, start_date=start_date, end_date=end_date)
            if df is not None and len(df) > 0:
                conn.execute(
                    "DELETE FROM top10_floatholders WHERE ts_code = ? AND end_date >= ? AND end_date <= ?",
                    (code, start_date, end_date),
                )
                upsert_top10_floatholders_rows(conn, df)
                total_rows += len(df)
            batch_count += 1

            if batch_count >= batch_size:
                conn.commit()
                elapsed = time.time() - batch_start_time
                if elapsed < 62:
                    wait = 62 - elapsed
                    print(f"  Rate limit: {i+1}/{len(codes)} stocks done, waiting {wait:.0f}s...")
                    time.sleep(wait)
                batch_start_time = time.time()
                batch_count = 0

            if (i + 1) % 50 == 0 or i == len(codes) - 1:
                conn.commit()
                print(f"  top10_floatholders: {i+1}/{len(codes)} stocks done ({total_rows} rows)")
        except Exception as e:
            print(f"  Warning: failed to fetch top10_floatholders for {code}: {e}")
            if "每分钟" in str(e) or "too many" in str(e).lower() or "权限" in str(e):
                print("  Rate limited, waiting 65s...")
                time.sleep(65)
                batch_start_time = time.time()
                batch_count = 0

    conn.commit()
    print(f"  top10_floatholders complete: {total_rows} rows across {len(codes)} stocks")


def main():
    parser = argparse.ArgumentParser(description="Tushare data fetcher")
    parser.add_argument("--dry-run", action="store_true", default=False, help="Use mock data instead of real API")
    parser.add_argument("--mode", choices=["daily", "history", "fundamental", "incremental", "benchmark-daily", "backfill-daily", "stk-limit", "moneyflow", "margin-detail", "adj-factor", "hk-hold", "top-list", "holder-trade", "top10-floatholders"], default="history", help="Fetch type")
    parser.add_argument("--start", default="20210101", help="Start date (YYYYMMDD)")
    parser.add_argument("--end", default="20241231", help="End date (YYYYMMDD)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of stocks to fetch (0 = default)")
    args = parser.parse_args()

    token = os.environ.get("TUSHARE_TOKEN", "")
    use_mock = args.dry_run or not token

    conn = get_connection()
    init_schema(conn)
    migrate_schema(conn)

    if args.mode in ("incremental", "benchmark-daily", "backfill-daily", "stk-limit", "moneyflow", "margin-detail", "adj-factor", "hk-hold", "top-list", "holder-trade", "top10-floatholders") and not token:
        print(f"ERROR: TUSHARE_TOKEN required for {args.mode} mode")
        sys.exit(1)

    if args.mode == "incremental":
        incremental_start = args.start if args.start != "20210101" else None
        print(f"Running incremental update through {args.end}")
        fetch_incremental_update(conn, token, incremental_start, args.end)
    elif args.mode == "benchmark-daily":
        print(f"Fetching benchmark index data ({args.start}–{args.end})")
        fetch_real_data(conn, token, args.start, args.end, args.mode, args.limit)
    elif args.mode == "backfill-daily":
        print(f"Backfilling pre_close/pct_chg ({args.start}–{args.end})")
        backfill_daily_by_date(conn, token, args.start, args.end)
    elif args.mode == "stk-limit":
        print(f"Fetching stk_limit data ({args.start}–{args.end})")
        fetch_stk_limit(conn, token, args.start, args.end)
    elif args.mode == "moneyflow":
        print(f"Fetching moneyflow data ({args.start}–{args.end})")
        fetch_moneyflow(conn, token, args.start, args.end)
    elif args.mode == "margin-detail":
        print(f"Fetching margin_detail data ({args.start}–{args.end})")
        fetch_margin_detail(conn, token, args.start, args.end)
    elif args.mode == "adj-factor":
        print(f"Fetching adj_factor data ({args.start}–{args.end})")
        fetch_adj_factor(conn, token, args.start, args.end)
    elif args.mode == "hk-hold":
        print(f"Fetching hk_hold data ({args.start}–{args.end})")
        fetch_hk_hold(conn, token, args.start, args.end)
    elif args.mode == "top-list":
        print(f"Fetching top_list data ({args.start}–{args.end})")
        fetch_top_list(conn, token, args.start, args.end)
    elif args.mode == "holder-trade":
        print(f"Fetching holder_trade data ({args.start}–{args.end})")
        fetch_holder_trade(conn, token, args.start, args.end)
    elif args.mode == "top10-floatholders":
        print(f"Fetching top10_floatholders data ({args.start}–{args.end}, limit={args.limit or 'all'})")
        fetch_top10_floatholders(conn, token, args.start, args.end, args.limit)
    elif use_mock:
        print("Running in DRY-RUN mode (mock data)")
        populate_mock_data(conn, args.start, args.end, args.mode)
    else:
        print(f"Fetching real data from Tushare (mode={args.mode}, limit={args.limit or 'default'})")
        fetch_real_data(conn, token, args.start, args.end, args.mode, args.limit)

    conn.close()
    print(f"Database: {DB_PATH}")


if __name__ == "__main__":
    main()
