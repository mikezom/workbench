# Crawl Section — Technical Description

## Overview

The Crawl section is a multi-source content aggregator dashboard. It displays panels for various technical content sources (arXiv, Hacker News, Lobsters, nLab, Planet Haskell, Reddit) in a grid layout. Currently, only the arXiv panel has a search UI with mock data — the remaining five panels are placeholder stubs showing "Coming soon."

There are no API routes, no database tables, and no backend logic for the Crawl section yet. All state is client-side. A `crawls.json` file exists in `data/` but is empty (`[]`).

## Architecture

```
UI (crawl/page.tsx — single client component)
  ↓ (future)
API Routes (not yet implemented)
  ↓ (future)
External APIs (arXiv, HN, Lobsters, nLab, Planet Haskell, Reddit)
```

Currently everything is self-contained in the page component with no backend calls.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/crawl/page.tsx` | Entire Crawl UI — all panel sub-components in one file |
| `src/app/crawl/page.test.tsx` | Static tests verifying 6 panels exist with correct titles |
| `data/crawls.json` | Empty JSON array — unused placeholder for future persistence |

No API routes. No lib utilities. No shared components beyond the page itself.

## Content Sources (Panels)

| Panel | Color Indicator | Status | External Source |
|-------|----------------|--------|----------------|
| ArxivPanel | Blue | Search UI + mock data | arXiv API (`export.arxiv.org/api/query`) |
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

- `papers: ArxivPaper[]` — search results (currently mock data)
- `loading: boolean` — fetch in progress
- `query: string` — search query, defaults to `"cat:cs.AI"`

### Behavior

1. User enters a query (default: `cat:cs.AI`)
2. Clicks "Search" button
3. `fetchPapers()` sets loading state, populates with one mock paper
4. Papers render as cards with title, authors, summary (3-line clamp), date, and "View on arXiv" link

The `fetchPapers` function currently returns hardcoded mock data. The actual arXiv API integration is not yet implemented.

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

- **No backend exists** — all "crawl" functionality is client-side only; don't assume API routes exist
- **Mock data only** — ArxivPanel's `fetchPapers` returns hardcoded data, not real API responses
- **Single-column layout** — panels stack vertically in one column; switching to multi-column grid would need responsive breakpoints
- **No error handling UI** — the ArxivPanel catches errors but only logs to console; no user-facing error state
