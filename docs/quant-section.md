# Quant Section — Technical Description

## Overview

The Quant section provides quantitative trading strategy development and backtesting. Users select factors from a predefined list, the backend trains a model (Linear, Ridge, Lasso, Random Forest, or XGBoost) to predict returns, and a backtesting engine simulates portfolio performance. Market data comes from Tushare API (Chinese A-share markets), cached in a separate SQLite database. A dry-run mode with mock data is provided for development and testing.

## Architecture

```
UI (quant/page.tsx — tabbed client component)
  ↓ fetch
API Routes (Next.js route handlers)
  ↓ call
DB Layer (src/lib/quant-db.ts — strategy/backtest CRUD)
  ↓ read/write                    ↓ read
SQLite (data/workbench.db)     Tushare DB (shared-data/tushare/tushare.db)
                                  ↑ populate
                               Python scripts (tushare_fetcher.py, quant_backtest.py)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/quant/page.tsx` | Main page with 4 tabs: Strategies, Backtest, Results, Data |
| `src/lib/quant-db.ts` | Schema, seed factors, CRUD for strategies/backtests |
| `src/lib/tushare-db.ts` | Read-only accessor for external tushare.db market data |
| `src/components/quant/factor-picker.tsx` | Multi-select factor picker grouped by category |
| `src/components/quant/strategy-form.tsx` | Create/edit strategy with model + hyperparams |
| `src/components/quant/strategy-list.tsx` | Table of strategies with actions |
| `src/components/quant/backtest-config.tsx` | Backtest configuration form |
| `src/components/quant/equity-chart.tsx` | Plotly equity curve chart |
| `src/components/quant/candlestick-chart.tsx` | Plotly OHLCV candlestick chart |
| `src/components/quant/metrics-panel.tsx` | Performance metrics grid |
| `src/components/quant/monthly-returns-heatmap.tsx` | Plotly monthly returns heatmap |
| `src/components/quant/factor-analysis.tsx` | Factor importance bar chart |
| `src/components/quant/trade-log-table.tsx` | Scrollable trade log table |
| `scripts/mock_data.py` | Deterministic mock OHLCV + fundamental data generator |
| `scripts/tushare_fetcher.py` | Data fetcher (mock or real Tushare API) |
| `scripts/quant_factors.py` | Factor computation library (71 factors) |
| `scripts/quant_models.py` | Model wrappers (Linear, Ridge, Lasso, RF, XGBoost) |
| `scripts/quant_backtest.py` | Core backtesting engine (walk-forward) |

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/quant/factors` | GET | List factors (optional `?category=` filter) |
| `/api/quant/strategies` | GET, POST | List/create strategies |
| `/api/quant/strategies/[id]` | GET, PUT, DELETE | Single strategy CRUD |
| `/api/quant/backtest` | GET, POST | List runs / create run + spawn backtest |
| `/api/quant/backtest/[id]` | GET, DELETE | Run status + results + trade log |
| `/api/quant/data` | GET, POST | Data summary / trigger sync |
| `/api/quant/data/ohlcv` | GET | OHLCV data for charts |

## Database Schema

### In workbench.db

- `quant_factors` — 71 seeded factors across 4 categories (price, volume, fundamental, technical)
- `quant_strategies` — Strategy config (name, factors JSON, model type, hyperparams, universe)
- `quant_backtest_runs` — Run config + status tracking
- `quant_backtest_results` — Computed metrics + equity curve + monthly returns + factor importance
- `quant_trade_log` — Individual trades from backtests

### In tushare.db (separate, at shared-data/tushare/)

- `daily_ohlcv` — Daily OHLCV price/volume data
- `daily_basic` — Daily valuation, turnover, share-capital, and market-cap data
- `fina_indicator` — Quarterly fundamental indicators
- `index_daily` — Benchmark index daily data
- `margin_detail` — Daily margin-financing and securities-lending detail
- `moneyflow` — Daily stock money-flow breakdown
- `stock_basic` — Stock listing info
- `stk_limit` — Daily upper/lower limit prices

## Factor Categories (71 total)

- **Price (25):** Momentum, mean reversion, volatility, moving-average shape, limit-price distance/counts, beta, residual volatility, and benchmark-relative strength
- **Volume (14):** Rolling volume ratios, OBV slope, VWAP deviation, turnover, free-float turnover, Tushare market volume ratio, money-flow imbalance signals, and margin-trading pressure signals
- **Fundamental (22):** Valuation, TTM yield factors, capital-structure ratios, market-cap structure, growth, profitability, liquidity, and listing age
- **Technical (10):** RSI, MACD, Bollinger, ATR, ADX, CCI, Stochastic, and Williams %R

## Design Decisions

- **Separate tushare.db** — Market data is independent, survives project rebuilds
- **On-demand subprocess** — Backtests run as spawned Python processes, not daemons
- **Walk-forward training** — Prevents look-ahead bias in model evaluation
- **Dry-run first** — All features work end-to-end with deterministic mock data
- **Plotly via dynamic import** — `react-plotly.js` loaded with `ssr: false` to avoid SSR issues
- **Factor seeding** — DB-based registry, extensible without code changes
