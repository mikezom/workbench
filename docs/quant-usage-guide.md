# Quant Section — Usage Guide

## Getting Started

Navigate to the **Quant** section from the sidebar. The section has four tabs: **Strategies**, **Backtest**, **Results**, and **Data**.

## 1. Check Your Data (Data Tab)

Before creating strategies, verify that market data is loaded.

- Go to the **Data** tab to see a summary: stock count, OHLCV row count, and date range.
- If data is missing, you can trigger a sync from this tab or run the fetcher manually:

```bash
# Dry-run with mock data (no API key needed)
python3 scripts/tushare_fetcher.py --dry-run

# Real data (requires TUSHARE_TOKEN env var)
TUSHARE_TOKEN="your_token" python3 scripts/tushare_fetcher.py --mode daily --start 20210101 --end 20261231

# Test with a small number of stocks first
TUSHARE_TOKEN="your_token" python3 scripts/tushare_fetcher.py --mode daily --limit 10
```

The fetcher has built-in rate limiting (480 calls/min) for the Tushare API. A full fetch of ~5,500 stocks takes about 12 minutes.

### Daily 18:00 Tushare Update

For unattended daily updates on macOS, create a local token file at `workbench/data/tushare.env`:

```bash
TUSHARE_TOKEN=your_token_here
```

Then you can run the incremental updater manually:

```bash
./scripts/update-tushare-data.sh
```

Or install the daily 18:00 launchd job:

```bash
./scripts/install-tushare-update-launch-agent.sh 18 0
```

The scheduled job refreshes `stock_basic`, reloads daily OHLCV from the latest cached trade date through today, refreshes benchmark index rows, refreshes `stk_limit`, refreshes `moneyflow`, refreshes `margin_detail`, refreshes `adj_factor`, refreshes `hk_hold`, refreshes `top_list`, and refreshes the `holder_trade` table for the same window. Logs are written to `workbench/logs/tushare-update.out.log` and `workbench/logs/tushare-update.err.log`.

### One-Time New-Factor Backfill

To populate the newly added factor source tables from the historical start of the local market cache, run:

```bash
./scripts/backfill-new-factors.sh
```

By default this backfills from `20210104` through today and runs:

- `moneyflow`
- `margin-detail`
- `adj-factor`
- `hk-hold`
- `top-list`
- `holder-trade`
- `top10-floatholders`

Optional environment variables:

```bash
TUSHARE_BACKFILL_START=20210104
TUSHARE_BACKFILL_END=20260321
TUSHARE_TOP10_LIMIT=500
```

Notes:

- The daily incremental updater does **not** refresh `top10-floatholders`; that endpoint is heavier and is intended for explicit backfills.
- `hk_hold` daily behavior changes after `2024-08-20`, when northbound holdings moved away from the earlier daily publication pattern.

## 2. Create a Strategy (Strategies Tab)

1. Click **New Strategy**.
2. Fill in:
   - **Name** — e.g., "Momentum + Value"
   - **Description** (optional)
   - **Factors** — select from 81 factors across 4 categories:
     - *Price*: momentum, mean reversion, volatility, moving-average shape, limit-price distance/counts, beta, benchmark-relative strength, and adjusted-close signals
     - *Volume*: volume ratios, OBV slope, VWAP deviation, turnover, free-float turnover, market volume ratio, money-flow imbalances, margin-trading pressure, and dragon-tiger list signals
     - *Fundamental*: valuation, TTM yields, market-cap structure, profitability, liquidity, growth, listing age, northbound ownership, insider accumulation, and ownership concentration
     - *Technical*: RSI, MACD, Bollinger, ATR, ADX, CCI, Stochastic, and Williams %R
   - **Model Type** — Linear Regression, Ridge, Lasso, Random Forest, or XGBoost
   - **Hyperparameters** — appear based on model type (e.g., alpha for Ridge/Lasso, n_estimators for RF/XGBoost)
   - **Universe** — stock universe: HS300, ZZ500, ZZ1000, ALL, or CUSTOM
3. Click **Save**.

## 3. Run a Backtest (Backtest Tab)

1. Select a strategy from the dropdown.
2. Configure:
   - **Date range** — start and end dates for the backtest period
   - **Initial capital** — starting portfolio value (default: 1,000,000)
   - **Benchmark** — comparison index (e.g., 000300.SH for CSI 300)
   - **Rebalance frequency** — how often to rebalance (weekly, biweekly, monthly)
   - **Top N** — number of stocks to hold in the portfolio
   - **Commission** — trading cost per trade (default: 0.1%)
3. Click **Run Backtest**.

The backtest runs as a background Python process. The UI polls for status every 2 seconds. The engine uses **walk-forward training** (60/40 train/test split) to prevent look-ahead bias.

## 4. Analyze Results (Results Tab)

Once a backtest completes, select it from the dropdown to see:

- **Metrics Panel** — total return, annualized return, Sharpe ratio, max drawdown, win rate, profit factor, total trades, alpha, beta
- **Equity Curve** — portfolio value over time vs. benchmark
- **Monthly Returns Heatmap** — color-coded grid of monthly returns by year
- **Factor Importance** — bar chart showing which factors the model weighted most
- **Trade Log** — full list of buy/sell trades with date, symbol, price, quantity, and commission

## Tips

- Start with a small date range and few factors to validate your hypothesis quickly.
- Compare different model types on the same factor set to see which captures the signal best.
- High Sharpe ratio (> 1.5) with low max drawdown (< 20%) indicates a robust strategy.
- Check factor importance — if only 1-2 factors dominate, consider simplifying the strategy.
- The Chinese market convention: **red = up, green = down** on candlestick charts.
