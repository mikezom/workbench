# JIN10 NEWS Panel Design

**Date:** 2026-03-05
**Status:** Approved
**Author:** Claude (Kiro)

## Overview

Replace the HackerNewsPanel stub in the Crawl section with a functional JIN10 NEWS panel that displays latest financial/economic news headlines from https://www.jin10.com/. The implementation follows the established ArxivPanel pattern with server-side HTML scraping, database caching, and a clean UI.

## Goals

1. Replace HackerNewsPanel with Jin10Panel showing real financial news
2. Maintain consistency with ArxivPanel's architecture and UX patterns
3. Provide 5-minute cache with stale fallback for reliability
4. Support flexible display: show summary when available, omit when not
5. Keep links minimal and unobtrusive

## Non-Goals

- Search/filter functionality (just show latest news)
- Category filtering (forex, stocks, etc.)
- Auto-refresh in background (manual refresh only)
- User bookmarking or persistence of read items

## Architecture

### Data Flow

```
Jin10Panel (UI Component)
  ↓ fetch('/api/crawl/jin10')
API Route (/api/crawl/jin10/route.ts)
  ↓ check cache (5-min TTL)
Database (jin10_cache table)
  ↓ if cache miss/expired
HTML Scraper (fetch https://www.jin10.com/)
  ↓ parse HTML
Parser (jin10-parser.ts)
  ↓ extract news items
Cache & Return
```

### Component Structure

**New Files:**
- `src/app/api/crawl/jin10/route.ts` - API proxy route with caching logic
- `src/lib/jin10-parser.ts` - HTML parser extracting news items
- `src/app/api/crawl/jin10/route.test.ts` - API route tests

**Modified Files:**
- `src/app/crawl/page.tsx` - Replace HackerNewsPanel with Jin10Panel
- `src/lib/crawl-db.ts` - Add jin10_cache schema and CRUD functions
- `src/lib/db.ts` - Initialize jin10_cache schema on startup
- `docs/crawl-section.md` - Update documentation

## Data Model

### Jin10NewsItem Type

```typescript
interface Jin10NewsItem {
  id: string;           // Generated UUID or extracted from DOM
  title: string;        // News headline (required)
  timestamp: string;    // ISO date string or relative time (required)
  summary?: string;     // Optional brief content
  link?: string;        // Optional URL to full article
}
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS jin10_cache (
  id          TEXT PRIMARY KEY,
  query       TEXT NOT NULL,      -- Always "latest" for now
  results     TEXT NOT NULL,      -- JSON array of Jin10NewsItem[]
  result_count INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL,   -- Cache creation time (ms)
  created_at  TEXT NOT NULL       -- ISO date string
);

CREATE INDEX IF NOT EXISTS idx_jin10_cache_query ON jin10_cache(query);
CREATE INDEX IF NOT EXISTS idx_jin10_cache_timestamp ON jin10_cache(timestamp);
```

**Cache key:** Always use `"latest"` as the query string since we're fetching the most recent news, not searching.

## Implementation Details

### 1. HTML Parser (`src/lib/jin10-parser.ts`)

**Responsibilities:**
- Accept raw HTML string from JIN10 homepage
- Extract news items using regex patterns (similar to arxiv-parser.ts)
- Handle missing summaries gracefully (return `undefined` for summary field)
- Generate UUIDs for items without unique IDs
- Return array of `Jin10NewsItem[]` (limit to ~10-20 most recent)

**Error handling:**
- Return empty array if HTML structure is unrecognizable
- Log warnings for malformed items but continue parsing others

**Export:**
```typescript
export function parseJin10Html(html: string): Jin10NewsItem[]
```

### 2. API Route (`src/app/api/crawl/jin10/route.ts`)

**Endpoint:** `GET /api/crawl/jin10`

**Behavior:**
1. Check cache for query="latest" with 5-minute TTL
2. If fresh cache exists: return cached results with `X-Cached: true` header
3. If cache miss/expired:
   - Fetch HTML from https://www.jin10.com/
   - Parse using `parseJin10Html()`
   - Cache results in database
   - Return parsed news items
4. If fetch fails and stale cache exists: return stale cache with 206 status
5. If fetch fails and no cache: return 500 error

**Constants:**
```typescript
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const JIN10_URL = "https://www.jin10.com/";
const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds
```

**Headers:**
- `User-Agent: WorkbenchCrawl/1.0` (same as ArxivPanel)
- `X-Cached: true|stale` - indicates cache status
- `X-Cache-Age: <ms>` - cache age in milliseconds
- `X-Error: <message>` - error message when serving stale cache

### 3. Database Functions (`src/lib/crawl-db.ts`)

Add parallel functions to existing arxiv functions:

```typescript
// Schema initialization (add to initCrawlSchema)
export function initCrawlSchema(db: Database.Database): void {
  // ... existing arxiv_cache schema ...

  db.exec(`
    CREATE TABLE IF NOT EXISTS jin10_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      results     TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jin10_cache_query
      ON jin10_cache(query);

    CREATE INDEX IF NOT EXISTS idx_jin10_cache_timestamp
      ON jin10_cache(timestamp);
  `);
}

// CRUD functions
export function createJin10Cache(data: { results: Jin10NewsItem[] }): Jin10CacheJson;
export function getJin10Cache(): Jin10CacheJson | undefined; // Always queries "latest"
export function deleteExpiredJin10Cache(beforeTimestamp: number): number;
```

**Note:** Unlike ArxivPanel which accepts a query parameter, Jin10 functions always use `"latest"` as the query internally.

### 4. UI Component (`Jin10Panel`)

**Location:** `src/app/crawl/page.tsx` (replace HackerNewsPanel function)

**State:**
```typescript
const [news, setNews] = useState<Jin10NewsItem[]>([]);
const [loading, setLoading] = useState(false);
```

**Behavior:**
- Auto-fetch on mount (useEffect with empty deps)
- Manual refresh via "Refresh" button
- Show loading state during fetch
- Display error alert on fetch failure (like ArxivPanel)

**Visual Design:**
- Header: Orange dot (same as old HackerNewsPanel) + "JIN10 NEWS" + count
- Refresh button: Same style as ArxivPanel's Search button
- News list: Scrollable with custom scrollbar (same CSS as ArxivPanel)
- News cards: Border, rounded, padding, white/dark background

**News Item Layout:**

When summary exists:
```
┌─────────────────────────────────────┐
│ Title (font-semibold, text-sm)      │
│ Timestamp (text-xs, muted)          │
│ Summary (text-xs, 2-3 line clamp)  │
│ → (minimal link icon)               │
└─────────────────────────────────────┘
```

When no summary:
```
┌─────────────────────────────────────┐
│ Title (font-semibold, text-sm)      │
│ Timestamp (text-xs, muted)          │
│ → (minimal link icon)               │
└─────────────────────────────────────┘
```

**Link styling:** Small "→" text or icon, blue color, right-aligned, only shown if link exists

**Empty state:** "Click Refresh to load latest news" (shown when news array is empty and not loading)

## Error Handling

### Parsing Errors
- If HTML structure is unrecognizable: return empty array, log error
- If individual items are malformed: skip them, continue parsing others
- If no items extracted: return empty array (not an error)

### Network Errors
- Timeout after 10 seconds
- If stale cache exists: serve with 206 status
- If no cache: return 500 with error message
- Frontend shows alert with error message

### Cache Errors
- Database errors during cache read: log and proceed to fetch
- Database errors during cache write: log but still return results to user

## Testing Strategy

### Unit Tests
- `jin10-parser.test.ts` - Test HTML parsing with various structures
- `crawl-db.test.ts` - Add tests for jin10_cache CRUD functions
- `route.test.ts` - Test API route caching, error handling, stale fallback

### Manual Testing
1. Fresh load: verify auto-fetch on mount
2. Refresh button: verify manual refresh works
3. Cache hit: verify cached results returned within 5 minutes
4. Cache miss: verify fresh fetch after 5 minutes
5. Network error: verify stale cache fallback (206 status)
6. No cache + error: verify 500 error shown
7. Items with summary: verify full layout
8. Items without summary: verify compact layout
9. Dark mode: verify colors and contrast

## Migration Notes

- No database migration needed (new table, no existing data)
- No breaking changes to existing code
- HackerNewsPanel is a stub, safe to replace completely

## Future Enhancements (Out of Scope)

- Category filtering (forex, stocks, commodities)
- Search functionality
- Auto-refresh every N minutes
- User bookmarking/read tracking
- RSS feed support
- Multiple language support (JIN10 has Chinese content)

## Success Criteria

1. Jin10Panel displays real financial news from JIN10
2. Caching works correctly (5-min TTL, stale fallback)
3. UI matches ArxivPanel's quality and consistency
4. All tests pass
5. Documentation updated
6. No regressions in other crawl panels
