"""Core backtesting engine for quant strategies.

Usage:
    python quant_backtest.py --run-id 1

Reads configuration from workbench.db, market data from tushare.db.
Writes results back to workbench.db.
"""

import argparse
import json
import os
import sqlite3
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from quant_factors import compute_factors
from quant_models import QuantModel
from quant_preprocess import preprocess_factors_cross_sectional

WORKBENCH_DB = Path(__file__).parent.parent / "data" / "workbench.db"
TUSHARE_DB = Path("/Users/ccnas/DEVELOPMENT/shared-data/tushare/tushare.db")
BENCHMARK_ALIASES = {
    "HS300": "000300.SH",
    "CSI 300": "000300.SH",
    "CSI300": "000300.SH",
    "000300": "000300.SH",
    "ZZ500": "000905.SH",
    "CSI 500": "000905.SH",
    "CSI500": "000905.SH",
    "000905": "000905.SH",
    "ZZ1000": "000852.SH",
    "CSI 1000": "000852.SH",
    "CSI1000": "000852.SH",
    "000852": "000852.SH",
}
DEFAULT_MAX_WORKERS = min(8, max(1, os.cpu_count() or 1))


def get_workbench_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(WORKBENCH_DB))
    conn.row_factory = sqlite3.Row
    return conn


def get_tushare_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(TUSHARE_DB))
    conn.row_factory = sqlite3.Row
    return conn


def load_stock_names(ts_conn: sqlite3.Connection) -> dict[str, str]:
    """Load stock names from stock_basic for ST detection."""
    rows = ts_conn.execute("SELECT ts_code, name FROM stock_basic").fetchall()
    return {r["ts_code"]: r["name"] for r in rows}


def load_stk_limit_data(ts_conn: sqlite3.Connection, start_date: str, end_date: str) -> dict[tuple[str, str], tuple[float, float]]:
    """Load exact limit prices from stk_limit table.

    Returns dict of (ts_code, trade_date) -> (up_limit, down_limit).
    Returns empty dict if table doesn't exist.
    """
    try:
        rows = ts_conn.execute(
            "SELECT ts_code, trade_date, up_limit, down_limit FROM stk_limit "
            "WHERE trade_date >= ? AND trade_date <= ?",
            (start_date, end_date),
        ).fetchall()
        return {(r["ts_code"], r["trade_date"]): (r["up_limit"], r["down_limit"]) for r in rows}
    except sqlite3.OperationalError:
        return {}


def get_limit_pct(ts_code: str, stock_name: str) -> float:
    """Return the daily price limit percentage for a stock (fallback when stk_limit unavailable).

    A-share rules:
    - ST / *ST stocks: 5%
    - ChiNext (300xxx.SZ) and STAR (688xxx.SH): 20%
    - Beijing exchange (8xxxxx.BJ, 4xxxxx.BJ): 30%
    - Main board (otherwise): 10%
    """
    if "ST" in stock_name.upper():
        return 0.05
    code_prefix = ts_code[:3]
    if code_prefix == "300" or code_prefix == "688":
        return 0.20
    if ts_code.endswith(".BJ"):
        return 0.30
    return 0.10


def is_limit_up(close: float, pre_close: float, limit_pct: float) -> bool:
    """Check if stock hit limit-up (涨停) using computed threshold. Uses 0.01 tolerance."""
    if pre_close <= 0:
        return False
    limit_price = round(pre_close * (1 + limit_pct), 2)
    return close >= limit_price - 0.01


def is_limit_down(close: float, pre_close: float, limit_pct: float) -> bool:
    """Check if stock hit limit-down (跌停) using computed threshold. Uses 0.01 tolerance."""
    if pre_close <= 0:
        return False
    limit_price = round(pre_close * (1 - limit_pct), 2)
    return close <= limit_price + 0.01


def check_limit_up(close: float, pre_close: float, limit_pct: float,
                    exact_up_limit: float | None) -> bool:
    """Check limit-up using exact limit price if available, else compute from pre_close."""
    if exact_up_limit is not None:
        return close >= exact_up_limit - 0.01
    return is_limit_up(close, pre_close, limit_pct)


def check_limit_down(close: float, pre_close: float, limit_pct: float,
                      exact_down_limit: float | None) -> bool:
    """Check limit-down using exact limit price if available, else compute from pre_close."""
    if exact_down_limit is not None:
        return close <= exact_down_limit + 0.01
    return is_limit_down(close, pre_close, limit_pct)


def normalize_benchmark_code(value: str | None) -> str:
    if not value:
        return "000300.SH"

    normalized = value.strip().upper()
    if normalized in BENCHMARK_ALIASES:
        return BENCHMARK_ALIASES[normalized]
    if len(normalized) == 6 and normalized.isdigit():
        return f"{normalized}.SH"
    return normalized


def load_run_config(wb_conn: sqlite3.Connection, run_id: int) -> dict:
    run = wb_conn.execute("SELECT * FROM quant_backtest_runs WHERE id = ?", (run_id,)).fetchone()
    if not run:
        raise ValueError(f"Backtest run {run_id} not found")

    strategy = wb_conn.execute(
        "SELECT * FROM quant_strategies WHERE id = ?", (run["strategy_id"],)
    ).fetchone()
    if not strategy:
        raise ValueError(f"Strategy {run['strategy_id']} not found")

    run_config = json.loads(run["config"]) if run["config"] else {}

    return {
        "run_id": run_id,
        "strategy_id": run["strategy_id"],
        "start_date": run["start_date"],
        "end_date": run["end_date"],
        "initial_capital": run["initial_capital"],
        "benchmark": normalize_benchmark_code(run["benchmark"]),
        "rebalance_freq": run["rebalance_freq"],
        "top_n": run["top_n"],
        "commission": run["commission"],
        "factors": json.loads(strategy["factors"]),
        "model_type": strategy["model_type"],
        "hyperparams": json.loads(strategy["hyperparams"]),
        "universe": strategy["universe"],
        "train_window_days": int(run_config.get("train_window_days", 240)),
        "prediction_horizon_days": int(run_config.get("prediction_horizon_days", 20)),
        "max_workers": int(run_config.get("max_workers", 0) or 0),
    }


def resolve_max_workers(task_count: int, configured_workers: int = 0) -> int:
    if task_count <= 1:
        return 1
    if configured_workers > 0:
        return min(task_count, configured_workers)

    env_workers = os.getenv("QUANT_BACKTEST_WORKERS")
    if env_workers:
        try:
            return min(task_count, max(1, int(env_workers)))
        except ValueError:
            pass

    return min(task_count, DEFAULT_MAX_WORKERS)


def load_stock_industries(ts_conn: sqlite3.Connection) -> dict[str, str]:
    """Load industry mapping from stock_basic."""
    rows = ts_conn.execute("SELECT ts_code, industry FROM stock_basic WHERE industry IS NOT NULL AND industry != ''").fetchall()
    return {r["ts_code"]: r["industry"] for r in rows}


def load_universe_codes(ts_conn: sqlite3.Connection, universe: str, as_of_date: str) -> list[str]:
    """Approximate index universes from market-cap ranks on the latest available snapshot."""
    rank_ranges = {
        "HS300": (0, 300),
        "ZZ500": (300, 800),
        "ZZ1000": (800, 1800),
    }
    if universe == "ALL":
        return [r["ts_code"] for r in ts_conn.execute("SELECT ts_code FROM stock_basic ORDER BY ts_code").fetchall()]
    start, end = rank_ranges.get(universe, (0, 0))
    if end == 0:
        return [r["ts_code"] for r in ts_conn.execute("SELECT ts_code FROM stock_basic").fetchall()]

    try:
        snapshot = ts_conn.execute(
            """
            SELECT MAX(trade_date) AS trade_date
            FROM daily_basic
            WHERE trade_date <= ?
            """,
            (as_of_date,),
        ).fetchone()
        snapshot_date = snapshot["trade_date"] if snapshot and snapshot["trade_date"] else None
        if not snapshot_date:
            snapshot = ts_conn.execute("SELECT MIN(trade_date) AS trade_date FROM daily_basic").fetchone()
            snapshot_date = snapshot["trade_date"] if snapshot and snapshot["trade_date"] else None

        if snapshot_date:
            rows = ts_conn.execute(
                """
                SELECT ts_code
                FROM daily_basic
                WHERE trade_date = ?
                  AND total_mv IS NOT NULL
                ORDER BY total_mv DESC, ts_code ASC
                LIMIT ? OFFSET ?
                """,
                (snapshot_date, end - start, start),
            ).fetchall()
            if rows:
                return [r["ts_code"] for r in rows]
    except sqlite3.OperationalError:
        pass

    snapshot = ts_conn.execute(
        """
        SELECT MAX(end_date) AS end_date
        FROM fina_indicator
        WHERE end_date <= ?
        """,
        (as_of_date,),
    ).fetchone()
    snapshot_date = snapshot["end_date"] if snapshot and snapshot["end_date"] else None
    if not snapshot_date:
        snapshot = ts_conn.execute("SELECT MIN(end_date) AS end_date FROM fina_indicator").fetchone()
        snapshot_date = snapshot["end_date"] if snapshot and snapshot["end_date"] else None

    if not snapshot_date:
        return [r["ts_code"] for r in ts_conn.execute("SELECT ts_code FROM stock_basic").fetchall()]

    rows = ts_conn.execute(
        """
        SELECT ts_code
        FROM fina_indicator
        WHERE end_date = ?
          AND total_mv IS NOT NULL
        ORDER BY total_mv DESC, ts_code ASC
        LIMIT ? OFFSET ?
        """,
        (snapshot_date, end - start, start),
    ).fetchall()
    return [r["ts_code"] for r in rows]


def load_stock_data(
    start_date: str,
    end_date: str,
    universe: str,
    custom_symbols: list[str] | None = None,
    max_workers: int = 0,
) -> dict[str, pd.DataFrame]:
    """Load all stock OHLCV data from tushare.db."""
    stocks = {}
    ts_conn = get_tushare_conn()
    if universe == "CUSTOM":
        codes = custom_symbols or []
    else:
        codes = load_universe_codes(ts_conn, universe, start_date)
    ts_conn.close()

    worker_count = resolve_max_workers(len(codes), max_workers)

    def load_single_stock(code: str) -> tuple[str, pd.DataFrame | None]:
        local_conn = get_tushare_conn()
        try:
            rows = local_conn.execute(
                "SELECT * FROM daily_ohlcv WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ? ORDER BY trade_date",
                (code, start_date, end_date),
            ).fetchall()
            if len(rows) < 60:
                return code, None

            df = pd.DataFrame([dict(r) for r in rows])
            df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d")
            df = df.set_index("trade_date").sort_index()

            try:
                basic_rows = local_conn.execute(
                    "SELECT trade_date, pe, pb, ps, total_mv, dv_ratio, turnover_rate FROM daily_basic WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ? ORDER BY trade_date",
                    (code, start_date, end_date),
                ).fetchall()
            except sqlite3.OperationalError:
                basic_rows = []
            if basic_rows:
                basic_df = pd.DataFrame([dict(r) for r in basic_rows])
                basic_df["trade_date"] = pd.to_datetime(basic_df["trade_date"], format="%Y%m%d")
                basic_df = basic_df.set_index("trade_date").sort_index()
                for col in ["pe", "pb", "ps", "total_mv", "turnover_rate"]:
                    if col in basic_df.columns:
                        df[col] = basic_df[col]
                if "dv_ratio" in basic_df.columns:
                    df["dividend_yield"] = basic_df["dv_ratio"]

            fina_rows = local_conn.execute(
                "SELECT end_date, roe, roa, debt_to_eqt, tr_yoy, netprofit_yoy FROM fina_indicator WHERE ts_code = ? ORDER BY end_date",
                (code,),
            ).fetchall()
            if fina_rows:
                fina_df = pd.DataFrame([dict(r) for r in fina_rows])
                fina_df["end_date"] = pd.to_datetime(fina_df["end_date"], format="%Y%m%d")
                fina_df = fina_df.set_index("end_date").sort_index()
                fina_daily = fina_df.reindex(df.index, method="ffill")
                for col in ["roe", "roa"]:
                    if col in fina_daily.columns:
                        df[col] = fina_daily[col]
                for source, target in [
                    ("pe", "pe"),
                    ("pb", "pb"),
                    ("ps", "ps"),
                    ("total_mv", "total_mv"),
                    ("dividend_yield", "dividend_yield"),
                ]:
                    if source in fina_daily.columns:
                        if target in df.columns:
                            df[target] = df[target].combine_first(fina_daily[source])
                        else:
                            df[target] = fina_daily[source]
                if "debt_to_eqt" in fina_daily.columns:
                    df["debt_to_equity"] = fina_daily["debt_to_eqt"]
                if "tr_yoy" in fina_daily.columns:
                    df["revenue_yoy"] = fina_daily["tr_yoy"]
                if "netprofit_yoy" in fina_daily.columns:
                    df["profit_yoy"] = fina_daily["netprofit_yoy"]

            return code, df
        finally:
            local_conn.close()

    if worker_count == 1:
        results = [load_single_stock(code) for code in codes]
    else:
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            results = list(executor.map(load_single_stock, codes))

    for code, df in results:
        if df is None:
            continue
        stocks[code] = df

    return stocks


def compute_stock_inputs(
    code: str,
    df: pd.DataFrame,
    factor_ids: list[str],
    prediction_horizon_days: int,
) -> tuple[str, pd.DataFrame, pd.Series, pd.Series, pd.Series | None]:
    factors_df = compute_factors(df, factor_ids)
    fwd_ret = compute_forward_returns(df, days=prediction_horizon_days)
    return_end_dates = compute_forward_return_end_dates(df, days=prediction_horizon_days)
    log_mcap = None
    if "total_mv" in df.columns:
        mv = df["total_mv"].replace(0, np.nan)
        log_mcap = np.log(mv)
    return code, factors_df, fwd_ret, return_end_dates, log_mcap


def compute_stock_inputs_from_item(
    item: tuple[str, pd.DataFrame],
    factor_ids: list[str],
    prediction_horizon_days: int,
) -> tuple[str, pd.DataFrame, pd.Series, pd.Series, pd.Series | None]:
    code, df = item
    return compute_stock_inputs(code, df, factor_ids, prediction_horizon_days)


def compute_forward_returns(df: pd.DataFrame, days: int = 5) -> pd.Series:
    """Compute forward returns for prediction target."""
    return df["close"].pct_change(days).shift(-days)


def compute_forward_return_end_dates(df: pd.DataFrame, days: int = 5) -> pd.Series:
    """Return the label end date for each forward-return observation."""
    return pd.Series(df.index, index=df.index).shift(-days)


def load_benchmark_close(
    ts_conn: sqlite3.Connection,
    benchmark_code: str,
    start_date: str,
    end_date: str,
) -> pd.Series | None:
    """Load benchmark close prices if the benchmark exists in the market-data DB."""
    rows = ts_conn.execute(
        """
        SELECT trade_date, close
        FROM daily_ohlcv
        WHERE ts_code = ? AND trade_date >= ? AND trade_date <= ?
        ORDER BY trade_date
        """,
        (benchmark_code, start_date, end_date),
    ).fetchall()
    if not rows:
        return None

    df = pd.DataFrame([dict(r) for r in rows])
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d")
    return df.set_index("trade_date")["close"].sort_index()


def get_rebalance_dates(dates: pd.DatetimeIndex, freq: str) -> list[pd.Timestamp]:
    """Get rebalance dates based on frequency."""
    if freq == "daily":
        return list(dates)
    elif freq == "weekly":
        iso = dates.isocalendar()
        weekly = dates.to_series().groupby([iso.year, iso.week]).last()
        return sorted(pd.Timestamp(d) for d in weekly.values)
    elif freq == "monthly":
        monthly = dates.to_series().groupby([dates.year, dates.month]).last()
        return sorted(pd.Timestamp(d) for d in monthly.values)
    return list(dates)


def build_training_dataset(
    factor_data: dict[str, pd.DataFrame],
    returns_data: dict[str, pd.Series],
    return_end_dates: dict[str, pd.Series],
    train_start: pd.Timestamp,
    train_end: pd.Timestamp,
) -> tuple[np.ndarray | None, np.ndarray | None]:
    x_train_list: list[np.ndarray] = []
    y_train_list: list[np.ndarray] = []

    for code, factors_df in factor_data.items():
        returns = returns_data[code]
        label_end_dates = return_end_dates[code]
        mask = build_training_mask(factors_df, returns, label_end_dates, train_start, train_end)
        if mask.sum() == 0:
            continue

        x_train_list.append(factors_df.loc[mask].values)
        y_train_list.append(returns.loc[mask].values)

    if not x_train_list:
        return None, None

    x_train = np.vstack(x_train_list)
    y_train = np.concatenate(y_train_list)
    valid = np.isfinite(x_train).all(axis=1) & np.isfinite(y_train)
    x_train = x_train[valid]
    y_train = y_train[valid]

    if len(x_train) == 0:
        return None, None

    return x_train, y_train


def build_training_mask(
    factors_df: pd.DataFrame,
    returns: pd.Series,
    label_end_dates: pd.Series,
    train_start: pd.Timestamp,
    train_end: pd.Timestamp,
    *,
    exclude_future_overlap: bool = True,
) -> pd.Series:
    mask = (
        (factors_df.index >= train_start)
        & (factors_df.index < train_end)
        & factors_df.notna().all(axis=1)
        & returns.notna()
        & label_end_dates.notna()
    )
    if exclude_future_overlap:
        mask = mask & (label_end_dates < train_end)
    return mask


def summarize_future_label_overlap(
    factor_data: dict[str, pd.DataFrame],
    returns_data: dict[str, pd.Series],
    return_end_dates: dict[str, pd.Series],
    train_start: pd.Timestamp,
    train_end: pd.Timestamp,
) -> dict[str, int]:
    candidate_rows = 0
    blocked_overlap_rows = 0

    for code, factors_df in factor_data.items():
        returns = returns_data[code]
        label_end_dates = return_end_dates[code]
        raw_mask = build_training_mask(
            factors_df,
            returns,
            label_end_dates,
            train_start,
            train_end,
            exclude_future_overlap=False,
        )
        overlap_mask = raw_mask & (label_end_dates >= train_end)
        candidate_rows += int(raw_mask.sum())
        blocked_overlap_rows += int(overlap_mask.sum())

    return {
        "candidate_rows": candidate_rows,
        "blocked_overlap_rows": blocked_overlap_rows,
    }


def build_execution_schedule(
    signal_dates: list[pd.Timestamp],
    all_dates: pd.DatetimeIndex,
) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    schedule: list[tuple[pd.Timestamp, pd.Timestamp]] = []
    for signal_date in signal_dates:
        future_dates = all_dates[all_dates > signal_date]
        if len(future_dates) == 0:
            continue
        schedule.append((signal_date, future_dates[0]))
    return schedule


def round_value(value: float | None, digits: int = 4) -> float | None:
    if value is None or not np.isfinite(value):
        return None
    return round(float(value), digits)


def make_progress_updater(wb_conn: sqlite3.Connection, run_id: int):
    last_percent = -1.0
    last_message = None

    def update(percent: float, message: str) -> None:
        nonlocal last_percent, last_message
        percent = max(0.0, min(100.0, percent))
        rounded_percent = round(percent, 1)
        if rounded_percent == last_percent and message == last_message:
            return
        wb_conn.execute(
            """
            UPDATE quant_backtest_runs
            SET progress_percent = ?, progress_message = ?
            WHERE id = ?
            """,
            (rounded_percent, message, run_id),
        )
        wb_conn.commit()
        last_percent = rounded_percent
        last_message = message

    return update


def run_backtest(config: dict, progress_callback=None) -> dict:
    """Run the backtest and return results."""
    ts_conn = get_tushare_conn()

    def update_progress(percent: float, message: str) -> None:
        if progress_callback:
            progress_callback(percent, message)

    print(
        f"Loading stock data ({config['start_date']}–{config['end_date']}, "
        f"universe={config['universe']})..."
    )
    update_progress(5, "Loading stock data")
    custom_symbols = None
    if config["universe"] == "CUSTOM":
        raw_symbols = config["hyperparams"].get("universe_symbols", [])
        if not isinstance(raw_symbols, list):
            raise ValueError("Custom universe requires a list of symbols")
        custom_symbols = [str(symbol).strip().upper() for symbol in raw_symbols if str(symbol).strip()]
        if not custom_symbols:
            raise ValueError("Custom universe requires at least one symbol")

    stocks = load_stock_data(
        config["start_date"],
        config["end_date"],
        config["universe"],
        custom_symbols,
        max_workers=config["max_workers"],
    )
    print(f"  Loaded {len(stocks)} stocks with sufficient data")

    # Load stock names and limit price data for limit-up/limit-down detection
    ts_conn_limits = get_tushare_conn()
    stock_names = load_stock_names(ts_conn_limits)
    stk_limit_data = load_stk_limit_data(ts_conn_limits, config["start_date"], config["end_date"])
    ts_conn_limits.close()
    if stk_limit_data:
        print(f"  Loaded {len(stk_limit_data)} exact limit prices from stk_limit table")
    else:
        print("  No stk_limit data available, using computed limit thresholds")

    # Precompute limit percentages per stock (fallback when stk_limit unavailable)
    stock_limit_pcts: dict[str, float] = {}
    for code in stocks:
        name = stock_names.get(code, "")
        stock_limit_pcts[code] = get_limit_pct(code, name)

    # Ensure pre_close exists in stock data (fallback for legacy databases)
    for code, df in stocks.items():
        if "pre_close" not in df.columns or df["pre_close"].isna().all():
            df["pre_close"] = df["close"].shift(1)

    update_progress(20, f"Loaded {len(stocks)} symbols")

    if len(stocks) < 5:
        raise ValueError("Not enough stocks with data for backtesting")

    factor_ids = config["factors"]
    print(f"Computing {len(factor_ids)} factors...")
    update_progress(25, "Computing factors")

    # Compute raw factors for all stocks
    all_factor_data: dict[str, pd.DataFrame] = {}
    all_returns: dict[str, pd.Series] = {}
    all_return_end_dates: dict[str, pd.Series] = {}
    stock_log_mcap: dict[str, pd.Series] = {}
    prediction_horizon_days = max(int(config["prediction_horizon_days"]), 1)
    stock_items = list(stocks.items())
    worker_count = resolve_max_workers(len(stock_items), config["max_workers"])
    print(f"  Using up to {worker_count} worker threads")

    if worker_count == 1:
        prepared_inputs = [
            compute_stock_inputs_from_item(item, factor_ids, prediction_horizon_days)
            for item in stock_items
        ]
    else:
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            prepared_inputs = list(
                executor.map(
                    partial(
                        compute_stock_inputs_from_item,
                        factor_ids=factor_ids,
                        prediction_horizon_days=prediction_horizon_days,
                    ),
                    stock_items,
                )
            )

    for code, factors_df, fwd_ret, return_end_dates, log_mcap in prepared_inputs:
        all_factor_data[code] = factors_df
        all_returns[code] = fwd_ret
        all_return_end_dates[code] = return_end_dates
        if log_mcap is not None:
            stock_log_mcap[code] = log_mcap
    update_progress(45, "Preprocessing factors")

    # Cross-sectional preprocessing: winsorize → neutralize → standardize
    stock_industry = load_stock_industries(ts_conn)
    print("Preprocessing factors (winsorize → neutralize → standardize)...")
    all_factor_data = preprocess_factors_cross_sectional(
        all_factor_data, stock_industry, stock_log_mcap, factor_ids, mad_n=3.5,
    )
    update_progress(55, "Running rolling backtest")

    # Get common trading dates
    all_dates = sorted(set().union(*[df.index for df in stocks.values()]))
    all_dates = pd.DatetimeIndex(all_dates)

    train_window_days = max(int(config["train_window_days"]), 60)
    first_train_end = all_dates[0] + pd.Timedelta(days=train_window_days)
    candidate_dates = all_dates[all_dates >= first_train_end]
    rebalance_dates = get_rebalance_dates(candidate_dates, config["rebalance_freq"])
    execution_schedule = build_execution_schedule(rebalance_dates, all_dates)

    if not rebalance_dates:
        raise ValueError("No rebalance dates available after applying the training window")
    if not execution_schedule:
        raise ValueError("No executable rebalance dates available after applying execution lag")

    print(f"Rolling training window: {train_window_days} calendar days")
    print(f"Prediction horizon: {prediction_horizon_days} trading days")
    print(
        f"Signal period: {execution_schedule[0][0].strftime('%Y-%m-%d')} "
        f"to {execution_schedule[-1][0].strftime('%Y-%m-%d')}"
    )
    print(
        f"Execution period: {execution_schedule[0][1].strftime('%Y-%m-%d')} "
        f"to {execution_schedule[-1][1].strftime('%Y-%m-%d')}"
    )
    print(f"Tradable rebalance dates: {len(execution_schedule)}")

    # Simulate trading
    capital = config["initial_capital"]
    cash = capital
    positions: dict[str, int] = {}  # code -> shares
    equity_curve = []
    trade_log = []
    top_n = config["top_n"]
    commission_rate = config["commission"]
    feature_importance_history: list[dict[str, float]] = []
    trained_windows = 0
    rank_ic_series: list[dict[str, float]] = []
    score_dispersion_series: list[dict[str, float]] = []
    top_bottom_spread_series: list[dict[str, float]] = []
    grouped_return_sums = [0.0] * 5
    grouped_return_counts = [0] * 5
    overlap_audit_rows = 0
    overlap_audit_candidate_rows = 0
    overlap_audit_flagged_windows = 0
    overlap_audit_samples: list[dict[str, int | str]] = []

    total_rebalances = max(len(execution_schedule), 1)
    for index, (signal_date, execution_date) in enumerate(execution_schedule, start=1):
        train_start = signal_date - pd.Timedelta(days=train_window_days)
        overlap_summary = summarize_future_label_overlap(
            all_factor_data,
            all_returns,
            all_return_end_dates,
            train_start,
            signal_date,
        )
        overlap_audit_candidate_rows += overlap_summary["candidate_rows"]
        overlap_audit_rows += overlap_summary["blocked_overlap_rows"]
        if overlap_summary["blocked_overlap_rows"] > 0:
            overlap_audit_flagged_windows += 1
            if len(overlap_audit_samples) < 5:
                overlap_audit_samples.append({
                    "signal_date": signal_date.strftime("%Y-%m-%d"),
                    "blocked_overlap_rows": overlap_summary["blocked_overlap_rows"],
                })

        x_train, y_train = build_training_dataset(
            all_factor_data,
            all_returns,
            all_return_end_dates,
            train_start,
            signal_date,
        )
        if x_train is None or y_train is None or len(x_train) < max(len(factor_ids) * 5, 50):
            if index == 1 or index == total_rebalances or index % 5 == 0:
                loop_progress = 55 + (index / total_rebalances) * 35
                update_progress(loop_progress, f"Backtesting rebalance {index}/{total_rebalances}")
            continue

        model = QuantModel(config["model_type"], config["hyperparams"])
        model.fit(x_train, y_train, feature_names=factor_ids)
        feature_importance_history.append(model.feature_importance())
        trained_windows += 1

        # Score all stocks on this date
        scores: dict[str, float] = {}
        for code in stocks:
            factors_df = all_factor_data[code]
            if signal_date in factors_df.index:
                x = factors_df.loc[signal_date].values.astype(float).reshape(1, -1)
                if np.isfinite(x).all():
                    scores[code] = float(model.predict(x)[0])

        if not scores:
            continue

        realized_pairs: list[tuple[float, float]] = []
        for code, score in scores.items():
            realized = all_returns[code].get(signal_date)
            if realized is None or not np.isfinite(realized):
                continue
            realized_pairs.append((score, float(realized)))

        if len(realized_pairs) >= 5:
            diag_df = pd.DataFrame(realized_pairs, columns=["score", "return"])
            rank_ic = diag_df["score"].corr(diag_df["return"], method="spearman")
            if rank_ic is not None and np.isfinite(rank_ic):
                rank_ic_series.append({
                    "date": signal_date.strftime("%Y-%m-%d"),
                    "value": round(float(rank_ic), 4),
                })

            score_dispersion_series.append({
                "date": signal_date.strftime("%Y-%m-%d"),
                "mean": round(float(diag_df["score"].mean()), 4),
                "std": round(float(diag_df["score"].std(ddof=0)), 4),
                "min": round(float(diag_df["score"].min()), 4),
                "max": round(float(diag_df["score"].max()), 4),
            })

            ranked_diag = diag_df.sort_values("score").reset_index(drop=True)
            bucket_ids = pd.qcut(
                ranked_diag.index,
                q=min(5, len(ranked_diag)),
                labels=False,
                duplicates="drop",
            )
            ranked_diag["bucket"] = bucket_ids
            bucket_means = ranked_diag.groupby("bucket")["return"].mean()
            if len(bucket_means) >= 2:
                spread = bucket_means.iloc[-1] - bucket_means.iloc[0]
                if np.isfinite(spread):
                    top_bottom_spread_series.append({
                        "date": signal_date.strftime("%Y-%m-%d"),
                        "value": round(float(spread), 4),
                    })
            for bucket, avg_return in bucket_means.items():
                bucket_index = int(bucket)
                if 0 <= bucket_index < len(grouped_return_sums) and np.isfinite(avg_return):
                    grouped_return_sums[bucket_index] += float(avg_return)
                    grouped_return_counts[bucket_index] += 1

        # Rank and select top N
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        target_codes = [code for code, _ in ranked[:top_n]]

        # Calculate portfolio value
        portfolio_value = cash
        for code, shares in positions.items():
            if execution_date in stocks[code].index:
                portfolio_value += shares * stocks[code].loc[execution_date, "close"]

        # Sell positions not in target (skip if limit-down: no buyers)
        execution_date_str = execution_date.strftime("%Y%m%d")
        for code in list(positions.keys()):
            if code not in target_codes and code in stocks and execution_date in stocks[code].index:
                row_data = stocks[code].loc[execution_date]
                price = row_data["open"]
                pre_cl = row_data.get("pre_close", np.nan)
                limit_key = (code, execution_date_str)
                exact_limits = stk_limit_data.get(limit_key)
                exact_down = exact_limits[1] if exact_limits else None
                if pd.notna(pre_cl) and check_limit_down(price, pre_cl, stock_limit_pcts.get(code, 0.10), exact_down):
                    continue  # Cannot sell at limit-down
                shares = positions.pop(code)
                amount = shares * price
                comm = amount * commission_rate
                cash += amount - comm
                trade_log.append({
                    "date": execution_date.strftime("%Y-%m-%d"),
                    "symbol": code,
                    "direction": "sell",
                    "quantity": shares,
                    "price": round(price, 2),
                    "amount": round(amount, 2),
                    "commission": round(comm, 2),
                    "reason": "rebalance",
                })

        # Buy target positions (skip if limit-up: no sellers)
        if target_codes:
            # Count buyable targets first for even allocation
            buyable = []
            for code in target_codes:
                if code not in positions and code in stocks and execution_date in stocks[code].index:
                    row_data = stocks[code].loc[execution_date]
                    price = row_data["open"]
                    pre_cl = row_data.get("pre_close", np.nan)
                    limit_key = (code, execution_date_str)
                    exact_limits = stk_limit_data.get(limit_key)
                    exact_up = exact_limits[0] if exact_limits else None
                    if pd.notna(pre_cl) and check_limit_up(price, pre_cl, stock_limit_pcts.get(code, 0.10), exact_up):
                        continue  # Cannot buy at limit-up
                    buyable.append((code, price))

            if buyable:
                allocation = cash / len(buyable)
                for code, price in buyable:
                    shares = int(allocation / price / 100) * 100  # Round to lots of 100
                    if shares > 0:
                        amount = shares * price
                        comm = amount * commission_rate
                        if amount + comm <= cash:
                            positions[code] = positions.get(code, 0) + shares
                            cash -= amount + comm
                            trade_log.append({
                                "date": execution_date.strftime("%Y-%m-%d"),
                                "symbol": code,
                                "direction": "buy",
                                "quantity": shares,
                                "price": round(price, 2),
                                "amount": round(amount, 2),
                                "commission": round(comm, 2),
                                "reason": "rebalance",
                            })

        # Record equity
        total_value = cash
        for code, shares in positions.items():
            if execution_date in stocks[code].index:
                total_value += shares * stocks[code].loc[execution_date, "close"]
        equity_curve.append({"date": execution_date.strftime("%Y-%m-%d"), "value": round(total_value, 2)})
        if index == 1 or index == total_rebalances or index % 5 == 0:
            loop_progress = 55 + (index / total_rebalances) * 35
            update_progress(loop_progress, f"Backtesting rebalance {index}/{total_rebalances}")

    print(f"Trained {trained_windows} rolling windows.")

    if not equity_curve:
        raise ValueError("No trades were executed during the backtest period")

    update_progress(92, "Calculating performance metrics")
    # Compute metrics
    equity_values = [e["value"] for e in equity_curve]
    eq_dates = pd.DatetimeIndex(pd.to_datetime([e["date"] for e in equity_curve]))
    equity_series = pd.Series(equity_values, index=eq_dates)
    returns_series = equity_series.pct_change().dropna()

    total_return = (equity_values[-1] / capital - 1) if equity_values else 0

    # Calculate n_years from actual date range, not point count
    n_years = (eq_dates[-1] - eq_dates[0]).days / 365.25 if len(eq_dates) > 1 else 0
    annualized_return = (1 + total_return) ** (1 / max(n_years, 0.01)) - 1 if n_years > 0 else 0

    # Sharpe: annualize based on actual rebalance frequency
    freq = config["rebalance_freq"]
    periods_per_year = {"daily": 252, "weekly": 52, "monthly": 12}.get(freq, 252)
    sharpe = (returns_series.mean() / returns_series.std() * np.sqrt(periods_per_year)) if len(returns_series) > 1 and returns_series.std() > 0 else 0

    # Max drawdown
    peak = pd.Series(equity_values).cummax()
    drawdown = (pd.Series(equity_values) - peak) / peak
    max_drawdown = float(drawdown.min()) if len(drawdown) > 0 else 0

    benchmark_return = None
    benchmark_curve = None
    benchmark_curve_series = None
    alpha = None
    beta = None
    benchmark_close = load_benchmark_close(
        ts_conn,
        config["benchmark"],
        config["start_date"],
        config["end_date"],
    )
    if benchmark_close is not None and not benchmark_close.empty:
        aligned_benchmark = benchmark_close.reindex(eq_dates, method="ffill")
        aligned_benchmark = aligned_benchmark.bfill()

        if aligned_benchmark.notna().all():
            benchmark_curve_series = capital * aligned_benchmark / aligned_benchmark.iloc[0]
            benchmark_curve = [
                {"date": date.strftime("%Y-%m-%d"), "value": round(float(value), 2)}
                for date, value in benchmark_curve_series.items()
            ]
            benchmark_return = float(benchmark_curve_series.iloc[-1] / capital - 1)

            benchmark_returns = benchmark_curve_series.pct_change().dropna()
            aligned_returns = pd.concat(
                [returns_series.rename("strategy"), benchmark_returns.rename("benchmark")],
                axis=1,
                join="inner",
            ).dropna()
            if len(aligned_returns) > 1:
                bench_var = aligned_returns["benchmark"].var()
                if bench_var > 0:
                    cov = aligned_returns["strategy"].cov(aligned_returns["benchmark"])
                    beta = float(cov / bench_var)
                    alpha = float(
                        (aligned_returns["strategy"].mean() - beta * aligned_returns["benchmark"].mean())
                        * periods_per_year
                    )

    yearly_performance = []
    for year, group in equity_series.groupby(equity_series.index.year):
        strategy_return = group.iloc[-1] / group.iloc[0] - 1 if len(group) > 1 else 0
        benchmark_year_return = None
        excess_return = None
        if benchmark_curve_series is not None:
            benchmark_group = benchmark_curve_series[benchmark_curve_series.index.year == year]
            if len(benchmark_group) > 1:
                benchmark_year_return = benchmark_group.iloc[-1] / benchmark_group.iloc[0] - 1
                excess_return = strategy_return - benchmark_year_return
        yearly_performance.append({
            "year": int(year),
            "strategy_return": round(float(strategy_return), 4),
            "benchmark_return": round_value(benchmark_year_return),
            "excess_return": round_value(excess_return),
        })

    # Win rate: match buy/sell pairs per stock and compare sell price vs buy price
    # Build cost basis from buy trades
    cost_basis: dict[str, list[float]] = {}  # code -> list of buy prices
    for t in trade_log:
        if t["direction"] == "buy":
            cost_basis.setdefault(t["symbol"], []).append(t["price"])

    sell_trades = [t for t in trade_log if t["direction"] == "sell"]
    wins = 0
    for t in sell_trades:
        buy_prices = cost_basis.get(t["symbol"], [])
        if buy_prices:
            avg_buy_price = buy_prices.pop(0)  # FIFO matching
            if t["price"] > avg_buy_price:
                wins += 1
    win_rate = wins / max(len(sell_trades), 1)

    # Monthly returns
    monthly_returns = []
    if equity_curve:
        eq_df = pd.DataFrame(equity_curve)
        eq_df["date"] = pd.to_datetime(eq_df["date"])
        eq_df = eq_df.set_index("date")
        for (year, month), group in eq_df.groupby([eq_df.index.year, eq_df.index.month]):
            if len(group) >= 2:
                mr = group["value"].iloc[-1] / group["value"].iloc[0] - 1
            else:
                mr = 0
            monthly_returns.append({"year": int(year), "month": int(month), "return": round(float(mr), 4)})

    factor_imp: dict[str, float] = {}
    if feature_importance_history:
        for factor in factor_ids:
            values = [window[factor] for window in feature_importance_history if factor in window]
            if values:
                factor_imp[factor] = round(float(np.mean(values)), 6)

    grouped_return = []
    for bucket_index, total in enumerate(grouped_return_sums):
        count = grouped_return_counts[bucket_index]
        if count == 0:
            continue
        grouped_return.append({
            "bucket": f"Q{bucket_index + 1}",
            "avg_return": round(total / count, 4),
        })

    diagnostics = {
        "rank_ic": rank_ic_series,
        "score_dispersion": score_dispersion_series,
        "top_bottom_spread": top_bottom_spread_series,
        "grouped_return": grouped_return,
        "audit": {
            "future_label_overlap": {
                "status": "pass" if overlap_audit_rows == 0 else "blocked",
                "checked_windows": total_rebalances,
                "candidate_rows": overlap_audit_candidate_rows,
                "blocked_overlap_rows": overlap_audit_rows,
                "flagged_windows": overlap_audit_flagged_windows,
                "sample_windows": overlap_audit_samples,
            },
            "execution_timing": {
                "status": "pass",
                "signal_source": "rebalance_close",
                "execution_source": "next_session_open",
                "bars_between_signal_and_execution": 1,
            },
        },
    }
    update_progress(97, "Saving results")

    return {
        "total_return": round(total_return, 4),
        "annualized_return": round(annualized_return, 4),
        "sharpe_ratio": round(float(sharpe), 4),
        "max_drawdown": round(float(max_drawdown), 4),
        "win_rate": round(win_rate, 4),
        "profit_factor": round(abs(total_return / max(abs(max_drawdown), 0.0001)), 4),
        "total_trades": len(trade_log),
        "alpha": round(alpha, 4) if alpha is not None else None,
        "beta": round(beta, 4) if beta is not None else None,
        "benchmark_return": round(benchmark_return, 4) if benchmark_return is not None else None,
        "benchmark_curve": benchmark_curve,
        "equity_curve": equity_curve,
        "monthly_returns": monthly_returns,
        "yearly_performance": yearly_performance,
        "factor_importance": factor_imp,
        "diagnostics": diagnostics,
        "training_windows": trained_windows,
        "trade_log": trade_log,
    }


def main():
    parser = argparse.ArgumentParser(description="Quant backtest engine")
    parser.add_argument("--run-id", type=int, required=True, help="Backtest run ID")
    args = parser.parse_args()

    wb_conn = get_workbench_conn()

    try:
        # Set status to running
        wb_conn.execute(
            """
            UPDATE quant_backtest_runs
            SET status = 'running', progress_percent = 1, progress_message = 'Initializing backtest'
            WHERE id = ?
            """,
            (args.run_id,),
        )
        wb_conn.commit()
        progress_callback = make_progress_updater(wb_conn, args.run_id)

        config = load_run_config(wb_conn, args.run_id)
        print(f"Running backtest #{args.run_id}: {config['model_type']} with {len(config['factors'])} factors")

        results = run_backtest(config, progress_callback=progress_callback)
        trade_log = results.pop("trade_log")

        # Write results
        wb_conn.execute(
            """INSERT INTO quant_backtest_results
               (run_id, total_return, annualized_return, sharpe_ratio, max_drawdown,
                win_rate, profit_factor, total_trades, alpha, beta, benchmark_return,
                benchmark_curve, equity_curve, monthly_returns, yearly_performance,
                factor_importance, diagnostics)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                args.run_id,
                results["total_return"],
                results["annualized_return"],
                results["sharpe_ratio"],
                results["max_drawdown"],
                results["win_rate"],
                results["profit_factor"],
                results["total_trades"],
                results["alpha"],
                results["beta"],
                results["benchmark_return"],
                json.dumps(results["benchmark_curve"]) if results["benchmark_curve"] is not None else None,
                json.dumps(results["equity_curve"]),
                json.dumps(results["monthly_returns"]),
                json.dumps(results["yearly_performance"]),
                json.dumps(results["factor_importance"]),
                json.dumps(results["diagnostics"]),
            ),
        )

        # Write trade log
        for t in trade_log:
            wb_conn.execute(
                """INSERT INTO quant_trade_log
                   (run_id, date, symbol, direction, quantity, price, amount, commission, reason)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (args.run_id, t["date"], t["symbol"], t["direction"],
                 t["quantity"], t["price"], t["amount"], t["commission"], t["reason"]),
            )

        # Update run status
        wb_conn.execute(
            """
            UPDATE quant_backtest_runs
            SET status = 'completed', completed_at = datetime('now'),
                progress_percent = 100, progress_message = 'Backtest complete'
            WHERE id = ?
            """,
            (args.run_id,),
        )
        wb_conn.execute(
            "UPDATE quant_strategies SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
            (config["strategy_id"],),
        )
        wb_conn.commit()
        print(f"Backtest #{args.run_id} completed successfully.")
        print(f"  Total return: {results['total_return']:.2%}")
        print(f"  Sharpe ratio: {results['sharpe_ratio']:.2f}")
        print(f"  Max drawdown: {results['max_drawdown']:.2%}")
        print(f"  Total trades: {results['total_trades']}")

    except Exception as e:
        traceback.print_exc()
        wb_conn.execute(
            """
            UPDATE quant_backtest_runs
            SET status = 'failed', error_message = ?, progress_message = 'Backtest failed'
            WHERE id = ?
            """,
            (str(e), args.run_id),
        )
        try:
            run = wb_conn.execute(
                "SELECT strategy_id FROM quant_backtest_runs WHERE id = ?",
                (args.run_id,),
            ).fetchone()
            if run:
                wb_conn.execute(
                    "UPDATE quant_strategies SET status = 'ready', updated_at = datetime('now') WHERE id = ?",
                    (run["strategy_id"],),
                )
        except Exception:
            pass
        wb_conn.commit()
        print(f"Backtest #{args.run_id} FAILED: {e}")
        sys.exit(1)
    finally:
        wb_conn.close()


if __name__ == "__main__":
    main()
