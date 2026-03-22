# Crawl Section — Technical Description

## Overview

The Crawl section is a mixed-source dashboard for external content. The current implementation has:

- 3 functional panels: arXiv, JIN10, SOLIDOT
- 3 source placeholders: nLab, Planet Haskell, Reddit
- 1 extra placeholder panel: Dummy Panel

The page uses a responsive split:

- desktop / landscape: a 3-column grid showing all 7 panels
- portrait mode: a bottom sub-navigation that switches between the 3 functional panels only

The active portrait tab is persisted in `localStorage` under `crawl-active-panel`.

## Architecture

```text
UI (src/app/crawl/page.tsx)
  ↓ fetch
API routes
  /api/crawl/arxiv
  /api/crawl/jin10
  /api/crawl/solidot
  ↓
SQLite caches in data/workbench.db
  arxiv_cache / jin10_cache / solidot_cache
  ↓
External sources
  arXiv API / JIN10 site / SOLIDOT RSS
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/crawl/page.tsx` | Entire Crawl UI, including all panel components and portrait sub-navigation |
| `src/app/crawl/page.test.tsx` | Static source tests for panel count, portrait nav, and active-panel state |
| `src/app/api/crawl/arxiv/route.ts` | arXiv search proxy + caching |
| `src/app/api/crawl/jin10/route.ts` | JIN10 latest-news fetch + caching |
| `src/app/api/crawl/solidot/route.ts` | SOLIDOT RSS fetch + caching |
| `src/lib/crawl-db.ts` | Cache schema and CRUD for the three sources |
| `src/lib/arxiv-parser.ts` | arXiv Atom/XML parsing |
| `src/lib/jin10-parser.ts` | JIN10 HTML parsing |
| `src/lib/solidot-parser.ts` | SOLIDOT RSS parsing |

## Current Panels

| Panel | Status | Notes |
|------|--------|-------|
| arXiv | Functional | Search-driven panel, defaults to `cat:cs.*` |
| JIN10 | Functional | Latest financial news with refresh button |
| SOLIDOT | Functional | Latest RSS news with refresh button |
| nLab | Placeholder | UI only |
| Planet Haskell | Placeholder | UI only |
| Reddit | Placeholder | UI only |
| Dummy Panel | Placeholder | UI only |

## UI Layout

### Desktop / Landscape

- The page renders a 3-column grid.
- Each grid cell is fixed to roughly half the viewport height.
- All 7 panels are visible at once.

### Portrait Mode

- A secondary bottom nav appears above the main app nav.
- Only `arxiv`, `jin10`, and `solidot` are switchable in portrait.
- Placeholder panels are hidden in portrait mode.
- The selected panel is restored from `localStorage`.

## Functional Panels

### arXiv

- Query input + search button
- Auto-fetch on mount
- Result cards show title, authors, summary, publish date, and external link
- Uses `/api/crawl/arxiv?q=...`
- Cache key is the full search query

### JIN10

- Auto-fetch on mount
- Manual refresh with `?refresh=true`
- Cards show title, optional summary, GMT+8 timestamp, and optional link
- Uses `/api/crawl/jin10`
- Cache key is always `latest`

### SOLIDOT

- Auto-fetch on mount
- Manual refresh with `?refresh=true`
- Cards show title, optional summary, timestamp, and link
- Uses `/api/crawl/solidot`
- Cache key is always `latest`

## Cache Layer

`src/lib/crawl-db.ts` initializes three SQLite tables:

- `arxiv_cache`
- `jin10_cache`
- `solidot_cache`

Each table stores:

- `id`
- `query`
- `results` as JSON text
- `result_count`
- `timestamp`
- `created_at`

The current routes use short-lived caching with stale fallback behavior when remote fetches fail.

## Tests

`src/app/crawl/page.test.tsx` currently verifies:

- 7 panel components are defined
- 7 panel usages appear in the grid
- source titles exist in the page source
- portrait `SubNavigation` exists
- `activePanel` state and `crawl-active-panel` persistence exist

## Current Limitations

- Only 3 panels have backend integration.
- Error handling is still alert-based in the page component.
- There is no unified source abstraction; each functional panel owns its own fetch and rendering path.
- Placeholder panels do not have API routes or persistence yet.
