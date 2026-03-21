"""Cross-sectional factor preprocessing: winsorize → neutralize → standardize.

All operations are per-date across stocks (cross-sectional).
"""

import numpy as np
import pandas as pd


def winsorize_mad(series: pd.Series, n: float = 3.5) -> pd.Series:
    """Winsorize using MAD (Median Absolute Deviation).

    Clips values to [median - n*MAD, median + n*MAD].
    MAD is scaled by 1.4826 to be consistent with std for normal distributions.
    """
    median = series.median()
    mad = (series - median).abs().median() * 1.4826
    if mad == 0 or np.isnan(mad):
        return series
    lower = median - n * mad
    upper = median + n * mad
    return series.clip(lower=lower, upper=upper)


def neutralize(factor_values: pd.Series, industry: pd.Series, log_mcap: pd.Series) -> pd.Series:
    """Neutralize factor against industry dummies + log market cap via OLS regression.

    Returns residuals (the part of the factor not explained by industry/size).
    """
    valid = factor_values.notna() & industry.notna() & log_mcap.notna() & np.isfinite(log_mcap)
    if valid.sum() < 10:
        return factor_values

    y = factor_values[valid].astype(float).values
    ind = industry[valid]
    mcap = log_mcap[valid].values

    # Build design matrix: industry dummies (drop first to avoid multicollinearity) + log_mcap
    dummies = pd.get_dummies(ind, drop_first=True, dtype=float)
    X = np.column_stack([dummies.values, mcap])

    # Add intercept
    X = np.column_stack([np.ones(len(X)), X])

    # OLS: residuals = y - X @ beta
    try:
        beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
        residuals = y - X @ beta
    except np.linalg.LinAlgError:
        return factor_values

    result = factor_values.astype(float).copy()
    result[valid] = residuals
    return result


def standardize(series: pd.Series) -> pd.Series:
    """Cross-sectional z-score: (x - mean) / std."""
    mean = series.mean()
    std = series.std()
    if std == 0 or np.isnan(std):
        return series * 0.0
    return (series - mean) / std


def preprocess_factors_cross_sectional(
    all_factor_data: dict[str, pd.DataFrame],
    stock_industry: dict[str, str],
    stock_log_mcap: dict[str, pd.Series],
    factor_ids: list[str],
    mad_n: float = 3.5,
) -> dict[str, pd.DataFrame]:
    """Apply winsorize → neutralize → standardize to all factors cross-sectionally.

    Args:
        all_factor_data: {stock_code: DataFrame with factor columns indexed by date}
        stock_industry: {stock_code: industry_name}
        stock_log_mcap: {stock_code: Series of log(market_cap) indexed by date}
        factor_ids: list of factor column names
        mad_n: MAD multiplier for winsorization (3.0-5.2)

    Returns:
        Updated all_factor_data with preprocessed values.
    """
    # Collect all dates
    all_dates = sorted(set().union(*[df.index for df in all_factor_data.values()]))
    codes = list(all_factor_data.keys())

    print(f"  Preprocessing {len(factor_ids)} factors across {len(all_dates)} dates...")

    for fid in factor_ids:
        # Build cross-sectional panel for this factor: (date, code) -> value
        panels = {}
        for code in codes:
            df = all_factor_data[code]
            if fid in df.columns:
                panels[code] = df[fid]

        if not panels:
            continue

        # Process each date cross-sectionally
        processed: dict[str, dict] = {code: {} for code in panels}

        for date in all_dates:
            # Gather values for this date
            values = {}
            industries = {}
            log_mcaps = {}
            for code, series in panels.items():
                if date in series.index and pd.notna(series[date]) and np.isfinite(series[date]):
                    values[code] = series[date]
                    industries[code] = stock_industry.get(code, "unknown")
                    if code in stock_log_mcap and date in stock_log_mcap[code].index:
                        lm = stock_log_mcap[code][date]
                        if pd.notna(lm) and np.isfinite(lm):
                            log_mcaps[code] = lm

            if len(values) < 10:
                # Too few stocks on this date, keep raw values
                for code, val in values.items():
                    processed[code][date] = val
                continue

            cs = pd.Series(values, dtype=float)
            ind_s = pd.Series(industries)
            mcap_s = pd.Series(log_mcaps)

            # 1. Winsorize
            cs = winsorize_mad(cs, n=mad_n)

            # 2. Neutralize (industry + log market cap)
            # Only neutralize if we have market cap data for most stocks
            if len(mcap_s) > len(cs) * 0.5:
                # Align: only keep stocks that have both factor and mcap
                common = cs.index.intersection(mcap_s.index).intersection(ind_s.index)
                if len(common) > 10:
                    cs_aligned = cs[common]
                    ind_aligned = ind_s[common]
                    mcap_aligned = mcap_s[common]
                    residuals = neutralize(cs_aligned, ind_aligned, mcap_aligned)
                    # Put residuals back, keep non-neutralized for stocks without mcap
                    for code in cs.index:
                        if code in residuals.index:
                            cs[code] = residuals[code]

            # 3. Standardize
            cs = standardize(cs)

            for code, val in cs.items():
                processed[code][date] = val

        # Write back processed values
        for code in panels:
            if processed[code]:
                proc_series = pd.Series(processed[code])
                proc_series.index = pd.DatetimeIndex(proc_series.index)
                all_factor_data[code][fid] = proc_series.reindex(all_factor_data[code].index)

    print("  Preprocessing complete.")
    return all_factor_data
