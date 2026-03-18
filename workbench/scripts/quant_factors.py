"""Factor computation library for quant backtesting.

Each factor function takes a DataFrame with OHLCV + fundamental columns
and returns a Series indexed by date with the factor value.
"""

import numpy as np
import pandas as pd
from typing import Callable

FactorFn = Callable[[pd.DataFrame], pd.Series]

# ---------------------------------------------------------------------------
# Price factors
# ---------------------------------------------------------------------------

def momentum_1m(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(20)

def momentum_3m(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(60)

def momentum_6m(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(120)

def momentum_12m(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(240)

def mean_reversion_5d(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(5).mean()
    return (df["close"] - ma) / ma

def mean_reversion_20d(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(20).mean()
    return (df["close"] - ma) / ma

def volatility_20d(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change().rolling(20).std() * np.sqrt(252)

def volatility_60d(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change().rolling(60).std() * np.sqrt(252)

def price_to_ma20(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(20).mean()
    return df["close"] / ma

def price_to_ma60(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(60).mean()
    return df["close"] / ma


def ret_20d(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(20)


def ret_60d(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(60)


def ma10_bias(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(10).mean()
    return (df["close"] - ma) / ma


def ma20_bias(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(20).mean()
    return (df["close"] - ma) / ma


def ma60_bias(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(60).mean()
    return (df["close"] - ma) / ma


def _rolling_slope(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window).apply(
        lambda values: np.polyfit(range(len(values)), values, 1)[0] if len(values) == window else np.nan
    )


def ma10_slope(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(10).mean()
    return _rolling_slope(ma, 10) / ma.replace(0, np.nan)


def ma20_slope(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(20).mean()
    return _rolling_slope(ma, 20) / ma.replace(0, np.nan)


def ma60_slope(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(60).mean()
    return _rolling_slope(ma, 60) / ma.replace(0, np.nan)


def position_20d(df: pd.DataFrame) -> pd.Series:
    low20 = df["low"].rolling(20).min()
    high20 = df["high"].rolling(20).max()
    return (df["close"] - low20) / (high20 - low20).replace(0, np.nan)

# ---------------------------------------------------------------------------
# Volume factors
# ---------------------------------------------------------------------------

def volume_ratio_5d(df: pd.DataFrame) -> pd.Series:
    return df["vol"].rolling(5).mean() / df["vol"].rolling(20).mean()

def volume_ratio_20d(df: pd.DataFrame) -> pd.Series:
    return df["vol"].rolling(20).mean() / df["vol"].rolling(60).mean()

def obv_slope(df: pd.DataFrame) -> pd.Series:
    sign = np.sign(df["close"].diff())
    obv = (sign * df["vol"]).cumsum()
    return obv.rolling(20).apply(lambda x: np.polyfit(range(len(x)), x, 1)[0] if len(x) == 20 else np.nan)

def vwap_deviation(df: pd.DataFrame) -> pd.Series:
    vwap = (df["amount"] / df["vol"]).rolling(20).mean()
    return (df["close"] - vwap) / vwap

def turnover_rate(df: pd.DataFrame) -> pd.Series:
    return df["vol"].rolling(5).mean()


def vol_ratio(df: pd.DataFrame) -> pd.Series:
    return df["vol"].rolling(5).mean() / df["vol"].rolling(20).mean()

# ---------------------------------------------------------------------------
# Fundamental factors (uses merged fundamental data)
# ---------------------------------------------------------------------------

def pe_ratio(df: pd.DataFrame) -> pd.Series:
    return df.get("pe", pd.Series(dtype=float))

def pb_ratio(df: pd.DataFrame) -> pd.Series:
    return df.get("pb", pd.Series(dtype=float))

def ps_ratio(df: pd.DataFrame) -> pd.Series:
    return df.get("ps", pd.Series(dtype=float))

def roe(df: pd.DataFrame) -> pd.Series:
    return df.get("roe", pd.Series(dtype=float))

def roa(df: pd.DataFrame) -> pd.Series:
    return df.get("roa", pd.Series(dtype=float))

def revenue_growth_yoy(df: pd.DataFrame) -> pd.Series:
    return df.get("revenue_yoy", pd.Series(dtype=float))

def profit_growth_yoy(df: pd.DataFrame) -> pd.Series:
    return df.get("profit_yoy", pd.Series(dtype=float))

def debt_to_equity(df: pd.DataFrame) -> pd.Series:
    return df.get("debt_to_equity", pd.Series(dtype=float))

def dividend_yield(df: pd.DataFrame) -> pd.Series:
    return df.get("dividend_yield", pd.Series(dtype=float))

def market_cap(df: pd.DataFrame) -> pd.Series:
    return df.get("total_mv", pd.Series(dtype=float))

# ---------------------------------------------------------------------------
# Technical factors
# ---------------------------------------------------------------------------

def rsi_14(df: pd.DataFrame) -> pd.Series:
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def macd_signal(df: pd.DataFrame) -> pd.Series:
    ema12 = df["close"].ewm(span=12).mean()
    ema26 = df["close"].ewm(span=26).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9).mean()
    return macd - signal


def macd_dif(df: pd.DataFrame) -> pd.Series:
    ema12 = df["close"].ewm(span=12).mean()
    ema26 = df["close"].ewm(span=26).mean()
    return ema12 - ema26


def macd_hist(df: pd.DataFrame) -> pd.Series:
    dif = macd_dif(df)
    signal = dif.ewm(span=9).mean()
    return dif - signal

def bollinger_position(df: pd.DataFrame) -> pd.Series:
    ma = df["close"].rolling(20).mean()
    std = df["close"].rolling(20).std()
    upper = ma + 2 * std
    lower = ma - 2 * std
    return (df["close"] - lower) / (upper - lower)

def atr_14(df: pd.DataFrame) -> pd.Series:
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.rolling(14).mean() / df["close"]

def adx_14(df: pd.DataFrame) -> pd.Series:
    plus_dm = df["high"].diff().clip(lower=0)
    minus_dm = (-df["low"].diff()).clip(lower=0)
    tr = atr_14(df) * df["close"]
    plus_di = 100 * plus_dm.rolling(14).mean() / tr.rolling(14).mean().replace(0, np.nan)
    minus_di = 100 * minus_dm.rolling(14).mean() / tr.rolling(14).mean().replace(0, np.nan)
    dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
    return dx.rolling(14).mean()

def cci_20(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    ma = tp.rolling(20).mean()
    md = tp.rolling(20).apply(lambda x: np.mean(np.abs(x - np.mean(x))))
    return (tp - ma) / (0.015 * md)

def stochastic_k(df: pd.DataFrame) -> pd.Series:
    low14 = df["low"].rolling(14).min()
    high14 = df["high"].rolling(14).max()
    return 100 * (df["close"] - low14) / (high14 - low14).replace(0, np.nan)

def williams_r(df: pd.DataFrame) -> pd.Series:
    high14 = df["high"].rolling(14).max()
    low14 = df["low"].rolling(14).min()
    return -100 * (high14 - df["close"]) / (high14 - low14).replace(0, np.nan)


# ---------------------------------------------------------------------------
# Factor registry
# ---------------------------------------------------------------------------

FACTOR_REGISTRY: dict[str, FactorFn] = {
    # Price
    "momentum_1m": momentum_1m,
    "momentum_3m": momentum_3m,
    "momentum_6m": momentum_6m,
    "momentum_12m": momentum_12m,
    "mean_reversion_5d": mean_reversion_5d,
    "mean_reversion_20d": mean_reversion_20d,
    "volatility_20d": volatility_20d,
    "volatility_60d": volatility_60d,
    "price_to_ma20": price_to_ma20,
    "price_to_ma60": price_to_ma60,
    "ret_20d": ret_20d,
    "ret_60d": ret_60d,
    "ma10_bias": ma10_bias,
    "ma20_bias": ma20_bias,
    "ma60_bias": ma60_bias,
    "ma10_slope": ma10_slope,
    "ma20_slope": ma20_slope,
    "ma60_slope": ma60_slope,
    "position_20d": position_20d,
    # Volume
    "volume_ratio_5d": volume_ratio_5d,
    "volume_ratio_20d": volume_ratio_20d,
    "obv_slope": obv_slope,
    "vwap_deviation": vwap_deviation,
    "turnover_rate": turnover_rate,
    "vol_ratio": vol_ratio,
    # Fundamental
    "pe_ratio": pe_ratio,
    "pb_ratio": pb_ratio,
    "ps_ratio": ps_ratio,
    "roe": roe,
    "roa": roa,
    "revenue_growth_yoy": revenue_growth_yoy,
    "profit_growth_yoy": profit_growth_yoy,
    "debt_to_equity": debt_to_equity,
    "dividend_yield": dividend_yield,
    "market_cap": market_cap,
    # Technical
    "rsi_14": rsi_14,
    "macd_signal": macd_signal,
    "macd_dif": macd_dif,
    "macd_hist": macd_hist,
    "bollinger_position": bollinger_position,
    "atr_14": atr_14,
    "adx_14": adx_14,
    "cci_20": cci_20,
    "stochastic_k": stochastic_k,
    "williams_r": williams_r,
}


def compute_factors(df: pd.DataFrame, factor_ids: list[str]) -> pd.DataFrame:
    """Compute selected factors for a stock's data."""
    result = pd.DataFrame(index=df.index)
    for fid in factor_ids:
        fn = FACTOR_REGISTRY.get(fid)
        if fn:
            try:
                result[fid] = fn(df)
            except Exception as e:
                print(f"Warning: factor {fid} computation failed: {e}")
                result[fid] = np.nan
    return result
