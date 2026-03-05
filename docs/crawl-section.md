# Crawl Section — Technical Description

## Overview

The Crawl section is a multi-source content aggregator dashboard. It displays panels for various technical content sources (arXiv, Jin10, Hacker News, Lobsters, nLab, Planet Haskell, Reddit) in a grid layout. Currently, the arXiv and Jin10 panels are fully functional with API integration and caching — the remaining five panels are placeholder stubs showing "Coming soon."

The arXiv and Jin10 panels have backend support via API proxy routes and database caching. Other sources are not yet implemented.

## Architecture

```
UI (crawl/page.tsx — single client component)
  ↓
API Routes (arXiv proxy implemented)
  ↓
Database Cache (arxiv_cache table in SQLite)
  ↓
External APIs (arXiv API implemented, others pending)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/crawl/page.tsx` | Entire Crawl UI — all panel sub-components in one file |
| `src/app/crawl/page.test.tsx` | Static tests verifying 6 panels exist with correct titles |
| `src/app/api/crawl/arxiv/route.ts` | arXiv API proxy — fetches and parses search results |
| `src/app/api/crawl/jin10/route.ts` | Jin10 API proxy — scrapes and caches financial news |
| `src/lib/crawl-db.ts` | Database operations for arXiv cache |
| `src/lib/crawl-db.test.ts` | Tests for arXiv cache CRUD operations |
| `src/lib/jin10-parser.ts` | HTML parser for Jin10 news content |
| `data/crawls.json` | Empty JSON array — unused placeholder for future persistence |

## Content Sources (Panels)

| Panel | Color Indicator | Status | External Source |
|-------|----------------|--------|----------------|
| ArxivPanel | Blue | Functional with API + caching | arXiv API (`export.arxiv.org/api/query`) |
| Jin10Panel | Yellow | Functional with scraping + caching | Jin10 (`www.jin10.com`) |
| HackerNewsPanel | Orange | Stub ("Coming soon") | HN API (`hacker-news.firebaseio.com`) |
| LobstersPanel | Red | Stub ("Coming soon") | Lobsters (`lobste.rs`) |
| NLabPanel | Green | Stub ("Coming soon") | nLab (`ncatlab.org`) |
| PlanetHaskellPanel | Purple | Stub ("Coming soon") | Planet Haskell (`planet.haskell.org`) |
| RedditPanel | Light Blue | Stub ("Coming soon") | Reddit API |

## UI Layout (`crawl/page.tsx`)

Single client component file containing all sub-components:

```
+----------------------------------------------+
| Crawl (header, h1)                           |
+----------------------------------------------+
| [ArxivPanel]                                 |
|   - Header: blue dot + "arXiv" + count       |
|   - Search bar: text input + Search button   |
|   - Papers list: title, authors, summary,    |
|     date, link                               |
+----------------------------------------------+
| [HackerNewsPanel]  "Coming soon"             |
+----------------------------------------------+
| [LobstersPanel]    "Coming soon"             |
+----------------------------------------------+
| [NLabPanel]        "Coming soon"             |
+----------------------------------------------+
| [PlanetHaskellPanel] "Coming soon"           |
+----------------------------------------------+
| [RedditPanel]      "Coming soon"             |
+----------------------------------------------+
```

- **Layout**: Single-column grid (`grid-cols-1`) with `gap-3`, full height with overflow hidden
- **Panel pattern**: Each panel follows the same structure — colored dot header, panel title, content area
- **No sidebar**: Unlike Study, the Crawl section has no sidebar or tab navigation

## ArxivPanel (Only Functional Panel)

### Types

```typescript
interface ArxivPaper {
  id: string;       // e.g., "2403.12345"
  title: string;
  authors: string[];
  summary: string;
  published: string; // ISO date string
  link: string;      // arXiv URL
}
```

### State

- `papers: ArxivPaper[]` — search results
- `loading: boolean` — fetch in progress
- `query: string` — search query, defaults to `"cat:cs.AI"`

### Behavior

1. User enters a query (default: `cat:cs.AI`)
2. Clicks "Search" button
3. `fetchPapers()` fetches from `/api/crawl/arxiv?q=...`
4. API route checks SQLite cache (5-minute TTL)
5. If no fresh cache: proxies to arXiv API, parses XML response, caches results
6. Papers render as cards with title, authors, summary (3-line clamp), date, and "View on arXiv" link
7. On error: shows stale cached results if available (206 status), otherwise alerts user

Caching reduces API calls and provides fallback on network errors. The arXiv API is called directly from the server to avoid CORS issues.

## Jin10 News Panel

Displays latest financial and economic news from [JIN10](https://www.jin10.com/).

### Features

- Auto-fetch on mount
- Manual refresh button
- 5-minute cache with stale fallback
- Flexible layout (shows summary when available)
- Minimal link indicators

### Architecture

- **Parser**: `src/lib/jin10-parser.ts` - HTML scraping with regex
- **API Route**: `src/app/api/crawl/jin10/route.ts` - Caching proxy
- **Database**: `jin10_cache` table in SQLite
- **UI**: `Jin10Panel` component in `src/app/crawl/page.tsx`

### Cache Strategy

- TTL: 5 minutes
- Stale fallback: Returns old cache if fetch fails
- Query key: Always "latest" (no search functionality)

### Error Handling

- Network timeout: 10 seconds
- Fetch failure with cache: Returns 206 with stale data
- Fetch failure without cache: Returns 500 error
- Parse failure: Returns empty array

## Cache Management

The arXiv API results are cached in the `arxiv_cache` table with:

- **TTL**: 5 minutes per query
- **Eviction**: `deleteExpiredArxivCache()` can be called to remove old entries
- **Fallback**: Stale cache is returned (with 206 status) if API fetch fails

Cache format:
```typescript
{
  id: string;           // UUID
  query: string;        // Search query (e.g., "cat:cs.AI")
  results: ArxivPaper[]; // Up to 10 papers
  result_count: number;
  timestamp: number;   // Cache creation time (ms)
  created_at: string;  // ISO date string
}
```

## Tests (`page.test.tsx`)

Static source-code tests (not rendering tests):

1. **6 panel components defined** — regex matches `function XxxPanel()` declarations
2. **6 panels in grid** — regex matches `<XxxPanel />` usages inside the grid div
3. **6 panel titles present** — checks source contains "arXiv", "Hacker News", "Lobsters", "nLab", "Planet Haskell", "Reddit"

These are file-content tests using `readFileSync`, not React rendering/DOM tests.

## Future Implementation Notes

To make this section functional, each panel would need:

1. **API route** (`src/app/api/crawl/{source}/route.ts`) — server-side proxy to the external API to avoid CORS and rate-limit issues
2. **Polling/caching** — periodic fetch with local caching to avoid hammering external APIs
3. **Persistence** — `crawls.json` or a SQLite table for saved/bookmarked items
4. **Unified item type** — normalize items across sources (title, url, date, source, summary)

## Common Pitfalls

- **Limited functionality** — Only arXiv panel is fully implemented; other panels are stubs
- **Single-column layout** — panels stack vertically in one column; switching to multi-column grid would need responsive breakpoints
- **Cache-only fallback** — When arXiv API fails, only cached results are shown (with 206 status), no retry mechanism
