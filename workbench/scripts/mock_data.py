"""Deterministic mock data generator for quant backtesting.

Generates 3+ years of daily OHLCV data for ~50 stocks (000001.SZ–000050.SZ)
using random walk with drift, seeded by stock code for reproducibility.
Also generates mock fundamental data.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta


def generate_ohlcv(
    ts_code: str,
    start_date: str = "20210101",
    end_date: str = "20241231",
) -> pd.DataFrame:
    """Generate deterministic daily OHLCV data for a single stock."""
    seed = int(ts_code.replace(".", "").replace("SZ", "1").replace("SH", "2"))
    rng = np.random.RandomState(seed)

    dates = pd.bdate_range(start=start_date, end=end_date)
    n = len(dates)

    # Random walk with drift
    base_price = 10 + rng.random() * 40  # 10-50 starting price
    drift = 0.0002  # slight upward drift
    vol = 0.02 + rng.random() * 0.02  # 2-4% daily vol

    log_returns = rng.normal(drift, vol, n)
    cum_returns = np.cumsum(log_returns)
    close = base_price * np.exp(cum_returns)

    # Generate OHLC from close
    daily_range = rng.uniform(0.005, 0.03, n)
    high = close * (1 + daily_range * rng.uniform(0.3, 1.0, n))
    low = close * (1 - daily_range * rng.uniform(0.3, 1.0, n))
    open_ = low + (high - low) * rng.uniform(0.2, 0.8, n)

    # Volume
    base_vol = 1_000_000 + rng.randint(0, 9_000_000)
    volume = (base_vol * (1 + rng.normal(0, 0.3, n))).clip(100_000).astype(int)

    # Amount (approximate)
    amount = volume * close * (1 + rng.normal(0, 0.01, n))

    df = pd.DataFrame({
        "ts_code": ts_code,
        "trade_date": [d.strftime("%Y%m%d") for d in dates],
        "open": np.round(open_, 2),
        "high": np.round(high, 2),
        "low": np.round(low, 2),
        "close": np.round(close, 2),
        "vol": volume,
        "amount": np.round(amount, 2),
    })
    return df


def generate_stock_basic(codes: list[str]) -> pd.DataFrame:
    """Generate mock stock basic info."""
    names = [f"Mock Stock {i+1:03d}" for i in range(len(codes))]
    industries = ["银行", "地产", "科技", "医药", "消费", "能源", "材料", "工业", "公用", "金融"]

    rows = []
    for i, code in enumerate(codes):
        rows.append({
            "ts_code": code,
            "name": names[i],
            "industry": industries[i % len(industries)],
            "market": "主板",
            "list_date": "20100101",
        })
    return pd.DataFrame(rows)


def generate_fundamentals(
    ts_code: str,
    start_date: str = "20210101",
    end_date: str = "20241231",
) -> pd.DataFrame:
    """Generate mock quarterly fundamental data."""
    seed = int(ts_code.replace(".", "").replace("SZ", "1").replace("SH", "2")) + 999
    rng = np.random.RandomState(seed)

    start = datetime.strptime(start_date, "%Y%m%d")
    end = datetime.strptime(end_date, "%Y%m%d")

    quarters = []
    current = datetime(start.year, ((start.month - 1) // 3) * 3 + 1, 1)
    while current <= end:
        q_end = current + timedelta(days=89)
        quarters.append(q_end.strftime("%Y%m%d"))
        month = current.month + 3
        year = current.year
        if month > 12:
            month -= 12
            year += 1
        current = datetime(year, month, 1)

    n = len(quarters)
    rows = []
    for i, end_date_str in enumerate(quarters):
        rows.append({
            "ts_code": ts_code,
            "end_date": end_date_str,
            "pe": round(10 + rng.random() * 40, 2),
            "pb": round(0.5 + rng.random() * 5, 2),
            "ps": round(0.5 + rng.random() * 10, 2),
            "roe": round(rng.normal(12, 5), 2),
            "roa": round(rng.normal(5, 3), 2),
            "revenue_yoy": round(rng.normal(10, 15), 2),
            "profit_yoy": round(rng.normal(8, 20), 2),
            "debt_to_equity": round(rng.uniform(0.2, 2.5), 2),
            "dividend_yield": round(rng.uniform(0, 5), 2),
            "total_mv": round(rng.uniform(50, 5000), 2),  # in 100M CNY
        })
    return pd.DataFrame(rows)


def get_stock_codes(n: int = 50) -> list[str]:
    """Return list of mock stock codes."""
    return [f"{i+1:06d}.SZ" for i in range(n)]


if __name__ == "__main__":
    codes = get_stock_codes()
    print(f"Generated {len(codes)} stock codes")
    sample = generate_ohlcv(codes[0])
    print(f"Sample OHLCV for {codes[0]}: {len(sample)} rows")
    print(sample.head())
