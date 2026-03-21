"""Factor computation library for quant backtesting.

Each factor function takes a DataFrame with OHLCV + fundamental columns
and returns a Series indexed by date with the factor value.
"""

import numpy as np
import pandas as pd
from typing import Callable

FactorFn = Callable[[pd.DataFrame], pd.Series]


def _nan_series(df: pd.DataFrame) -> pd.Series:
    return pd.Series(np.nan, index=df.index, dtype=float)


def _column_or_nan(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return _nan_series(df)
    return df[column]


def _safe_ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return numerator / denominator.replace(0, np.nan)


def _safe_reciprocal(series: pd.Series) -> pd.Series:
    return 1 / series.replace(0, np.nan)


def _benchmark_close(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "benchmark_close")


def _benchmark_returns(df: pd.DataFrame) -> pd.Series:
    return _benchmark_close(df).pct_change()


def _adjusted_close(df: pd.DataFrame) -> pd.Series:
    if "adj_factor" not in df.columns:
        return _nan_series(df)
    return df["close"] * df["adj_factor"]

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


def limit_up_gap(df: pd.DataFrame) -> pd.Series:
    return _safe_ratio(_column_or_nan(df, "up_limit") - df["close"], df["close"])


def limit_down_gap(df: pd.DataFrame) -> pd.Series:
    return _safe_ratio(df["close"] - _column_or_nan(df, "down_limit"), df["close"])


def limit_hit_20d(df: pd.DataFrame) -> pd.Series:
    if "up_limit" not in df.columns and "down_limit" not in df.columns:
        return _nan_series(df)
    up_limit = _column_or_nan(df, "up_limit")
    down_limit = _column_or_nan(df, "down_limit")
    if up_limit.isna().all() and down_limit.isna().all():
        return _nan_series(df)
    hits = ((df["close"] >= up_limit - 0.01) | (df["close"] <= down_limit + 0.01)).astype(float)
    return hits.rolling(20).sum()


def beta_60d(df: pd.DataFrame) -> pd.Series:
    stock_returns = df["close"].pct_change()
    benchmark_returns = _benchmark_returns(df)
    variance = benchmark_returns.rolling(60).var().replace(0, np.nan)
    covariance = stock_returns.rolling(60).cov(benchmark_returns)
    return covariance / variance


def residual_vol_60d(df: pd.DataFrame) -> pd.Series:
    stock_returns = df["close"].pct_change()
    benchmark_returns = _benchmark_returns(df)
    beta = beta_60d(df)
    residual = stock_returns - beta * benchmark_returns
    return residual.rolling(60).std() * np.sqrt(252)


def relative_strength_vs_benchmark(df: pd.DataFrame) -> pd.Series:
    return df["close"].pct_change(60) - _benchmark_close(df).pct_change(60)


def adjusted_momentum_3m(df: pd.DataFrame) -> pd.Series:
    return _adjusted_close(df).pct_change(60)


def adjusted_momentum_6m(df: pd.DataFrame) -> pd.Series:
    return _adjusted_close(df).pct_change(120)


def adjusted_ret_20d(df: pd.DataFrame) -> pd.Series:
    return _adjusted_close(df).pct_change(20)


def adjusted_mean_reversion_20d(df: pd.DataFrame) -> pd.Series:
    adj_close = _adjusted_close(df)
    ma = adj_close.rolling(20).mean()
    return (adj_close - ma) / ma

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


def free_float_turnover(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "turnover_rate_f")


def market_volume_ratio(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "volume_ratio")


def net_mf_amount_ratio(df: pd.DataFrame) -> pd.Series:
    # moneyflow amounts are in 10k CNY; daily amount is in 1k CNY.
    return _safe_ratio(_column_or_nan(df, "net_mf_amount") * 10, df["amount"])


def large_order_net_ratio(df: pd.DataFrame) -> pd.Series:
    buy = _column_or_nan(df, "buy_lg_amount")
    sell = _column_or_nan(df, "sell_lg_amount")
    return _safe_ratio(buy - sell, buy + sell)


def extra_large_order_imbalance(df: pd.DataFrame) -> pd.Series:
    buy = _column_or_nan(df, "buy_elg_amount")
    sell = _column_or_nan(df, "sell_elg_amount")
    return _safe_ratio(buy - sell, buy + sell)


def margin_balance_to_float_mv(df: pd.DataFrame) -> pd.Series:
    float_mv = _column_or_nan(df, "circ_mv") * 10000
    return _safe_ratio(_column_or_nan(df, "rzrqye"), float_mv)


def financing_buy_shock(df: pd.DataFrame) -> pd.Series:
    financing_buy = _column_or_nan(df, "rzmre")
    return _safe_ratio(financing_buy, financing_buy.rolling(20).mean())


def short_pressure(df: pd.DataFrame) -> pd.Series:
    return _safe_ratio(_column_or_nan(df, "rqye"), _column_or_nan(df, "rzrqye"))


def top_list_flag(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "top_list_flag")


def top_list_net_buy_ratio(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "top_list_net_buy_ratio")

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


def earnings_yield_ttm(df: pd.DataFrame) -> pd.Series:
    return _safe_reciprocal(_column_or_nan(df, "pe_ttm"))


def sales_yield_ttm(df: pd.DataFrame) -> pd.Series:
    return _safe_reciprocal(_column_or_nan(df, "ps_ttm"))


def dividend_yield_ttm(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "dv_ttm")


def float_market_cap(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "circ_mv")


def free_float_ratio(df: pd.DataFrame) -> pd.Series:
    return _safe_ratio(_column_or_nan(df, "free_share"), _column_or_nan(df, "total_share"))


def circulating_cap_ratio(df: pd.DataFrame) -> pd.Series:
    return _safe_ratio(_column_or_nan(df, "circ_mv"), _column_or_nan(df, "total_mv"))


def grossprofit_margin(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "grossprofit_margin")


def netprofit_margin(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "netprofit_margin")


def current_ratio(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "current_ratio")


def quick_ratio(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "quick_ratio")


def operating_revenue_yoy(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "operating_revenue_yoy")


def listing_age(df: pd.DataFrame) -> pd.Series:
    list_dates = _column_or_nan(df, "list_date")
    list_dates = pd.to_datetime(list_dates, errors="coerce")
    return (pd.Series(df.index, index=df.index) - list_dates).dt.days


def northbound_holding_ratio(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "northbound_holding_ratio")


def northbound_holding_change_20d(df: pd.DataFrame) -> pd.Series:
    return northbound_holding_ratio(df).diff(20)


def insider_accumulation(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "insider_net_change_ratio").rolling(180, min_periods=1).sum()


def ownership_concentration(df: pd.DataFrame) -> pd.Series:
    return _column_or_nan(df, "ownership_concentration")

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
    "limit_up_gap": limit_up_gap,
    "limit_down_gap": limit_down_gap,
    "limit_hit_20d": limit_hit_20d,
    "beta_60d": beta_60d,
    "residual_vol_60d": residual_vol_60d,
    "relative_strength_vs_benchmark": relative_strength_vs_benchmark,
    "adjusted_momentum_3m": adjusted_momentum_3m,
    "adjusted_momentum_6m": adjusted_momentum_6m,
    "adjusted_ret_20d": adjusted_ret_20d,
    "adjusted_mean_reversion_20d": adjusted_mean_reversion_20d,
    # Volume
    "volume_ratio_5d": volume_ratio_5d,
    "volume_ratio_20d": volume_ratio_20d,
    "obv_slope": obv_slope,
    "vwap_deviation": vwap_deviation,
    "turnover_rate": turnover_rate,
    "vol_ratio": vol_ratio,
    "free_float_turnover": free_float_turnover,
    "market_volume_ratio": market_volume_ratio,
    "net_mf_amount_ratio": net_mf_amount_ratio,
    "large_order_net_ratio": large_order_net_ratio,
    "extra_large_order_imbalance": extra_large_order_imbalance,
    "margin_balance_to_float_mv": margin_balance_to_float_mv,
    "financing_buy_shock": financing_buy_shock,
    "short_pressure": short_pressure,
    "top_list_flag": top_list_flag,
    "top_list_net_buy_ratio": top_list_net_buy_ratio,
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
    "earnings_yield_ttm": earnings_yield_ttm,
    "sales_yield_ttm": sales_yield_ttm,
    "dividend_yield_ttm": dividend_yield_ttm,
    "float_market_cap": float_market_cap,
    "free_float_ratio": free_float_ratio,
    "circulating_cap_ratio": circulating_cap_ratio,
    "grossprofit_margin": grossprofit_margin,
    "netprofit_margin": netprofit_margin,
    "current_ratio": current_ratio,
    "quick_ratio": quick_ratio,
    "operating_revenue_yoy": operating_revenue_yoy,
    "listing_age": listing_age,
    "northbound_holding_ratio": northbound_holding_ratio,
    "northbound_holding_change_20d": northbound_holding_change_20d,
    "insider_accumulation": insider_accumulation,
    "ownership_concentration": ownership_concentration,
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
