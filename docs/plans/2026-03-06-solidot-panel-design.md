# SOLIDOT Panel Design

## Overview

Replace the Lobsters panel stub in the Crawl section with a fully functional SOLIDOT news panel. SOLIDOT (https://www.solidot.org/) is a Chinese tech news aggregator. The panel will fetch and display news from their RSS feed with database caching.

## Requirements

- Replace `LobstersPanel` component with `SolidotPanel`
- Fetch news from `https://www.solidot.org/index.rss`
- RSS-optimized implementation (no Puppeteer needed)
- 60-minute cache TTL (slower update frequency than Jin10/arXiv)
- Jin10-style UI: auto-fetch on mount + manual refresh button
- Full display: title, summary, timestamp, and link
- Color indicator: RGB(0, 77, 77) - dark teal
- Label: "SOLIDOT" (all caps)

## Architecture & Data Flow

```
User loads /crawl page
  ↓
SolidotPanel component mounts
  ↓
Auto-fetch: GET /api/crawl/solidot
  ↓
API checks solidot_cache table (60-min TTL)
  ↓
Cache miss or expired?
  ├─ Yes: Fetch https://www.solidot.org/index.rss
  │        Parse RSS XML
  │        Extract items (title, link, pubDate, description)
  │        Save to solidot_cache
  │        Return fresh data
  │
  └─ No: Return cached data

User clicks Refresh button → repeat fetch flow
```

**Key components:**
- Database table: `solidot_cache` (similar to `jin10_cache`)
- API route: `/api/crawl/solidot/route.ts`
- RSS parser: `src/lib/solidot-parser.ts`
- UI component: `SolidotPanel` (replaces `LobstersPanel`)
- Cache TTL: 60 minutes
- Stale fallback: Returns old cache with 206 status if fetch fails

## Database Schema

**New table: `solidot_cache`**

```sql
CREATE TABLE IF NOT EXISTS solidot_cache (
  id TEXT PRIMARY KEY,           -- UUID
  query TEXT NOT NULL,           -- Always "latest" (no search functionality)
  results TEXT NOT NULL,         -- JSON array of news items
  result_count INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,    -- Cache creation time (ms)
  created_at TEXT NOT NULL       -- ISO date string
);
```

**Type definition:**

```typescript
interface SolidotNewsItem {
  id: string;        // Generated from link or guid
  title: string;
  link: string;
  timestamp: string; // Formatted pubDate
  summary?: string;  // RSS description field
}
```

**Database operations** (add to `src/lib/crawl-db.ts`):
- `getSolidotCache(query: string)` - Get cached results if fresh (< 60 min)
- `saveSolidotCache(query: string, items: SolidotNewsItem[])` - Save new results
- `deleteExpiredSolidotCache()` - Cleanup old entries (optional)

Mirrors the `arxiv_cache` pattern with different TTL and data structure.

## RSS Parser

**File: `src/lib/solidot-parser.ts`**

**Implementation:**
- Use native `fetch()` to get RSS XML from `https://www.solidot.org/index.rss`
- Parse XML using native XML parsing (DOMParser or xml2js)
- Extract fields from `<item>` elements: `<title>`, `<link>`, `<pubDate>`, `<description>`
- Transform into `SolidotNewsItem[]` format
- Limit to ~20 items

**Key function:**

```typescript
export async function fetchSolidotRSS(): Promise<SolidotNewsItem[]>
```

**Error handling:**
- Network timeout: 10 seconds
- Parse errors: Return empty array
- Invalid XML: Log error, return empty array

**Date formatting:**
- Parse RSS `<pubDate>` (RFC 822 format)
- Convert to readable format (e.g., "2026-03-06 14:30")

**ID generation:**
- Use `<link>` or `<guid>` as unique identifier
- Hash if needed to ensure uniqueness

Much simpler than Jin10's Puppeteer approach since RSS is static XML.

## API Route

**File: `src/app/api/crawl/solidot/route.ts`**

**GET handler logic:**

```typescript
export async function GET(request: Request) {
  const query = "latest"; // Always fetch latest (no search)

  // 1. Check cache (60-minute TTL)
  const cached = getSolidotCache(query);
  if (cached && !isExpired(cached, 60)) {
    return Response.json(cached.results);
  }

  // 2. Fetch fresh data
  try {
    const items = await fetchSolidotRSS();
    saveSolidotCache(query, items);
    return Response.json(items);
  } catch (error) {
    // 3. Stale fallback
    if (cached) {
      return Response.json(cached.results, { status: 206 });
    }
    return Response.json(
      { error: "Failed to fetch SOLIDOT news" },
      { status: 500 }
    );
  }
}
```

**Cache strategy:**
- Fresh cache (< 60 min): Return immediately (200)
- Expired cache + successful fetch: Return new data (200)
- Expired cache + failed fetch: Return stale data (206)
- No cache + failed fetch: Return error (500)

Matches Jin10 pattern with 60-minute TTL instead of 5 minutes.

## UI Component

**File: `src/app/crawl/page.tsx`**

**Component structure:**

```typescript
function SolidotPanel() {
  const [news, setNews] = useState<SolidotNewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    // Fetch from /api/crawl/solidot
    // Handle errors, update state
  };

  useEffect(() => {
    fetchNews(); // Auto-fetch on mount
  }, []);

  return (
    // Panel structure identical to Jin10Panel
  );
}
```

**Visual styling:**
- Header: Dark teal dot `bg-[rgb(0,77,77)]` + "SOLIDOT" label
- Refresh button: Same style as Jin10
- News list: Same card layout as Jin10 (title, summary, timestamp, link)
- Scrollbar: Same custom scrollbar as other panels
- Empty state: "Click Refresh to load latest news"

**Component replacement:**
- Delete `LobstersPanel` function entirely
- Add `SolidotPanel` function in its place
- Update main page grid: `<LobstersPanel />` → `<SolidotPanel />`
- Update type definitions to include `SolidotNewsItem`

## Error Handling

**Network errors:**
- Timeout after 10 seconds
- Show stale cache if available (206 status)
- Alert user if no cache available

**Parse errors:**
- Log to console
- Return empty array
- UI shows empty state

**Cache errors:**
- Database errors logged but don't block fetch
- Fetch proceeds even if cache read/write fails

**User feedback:**
- Loading state: "Loading..." button text
- Empty state: "Click Refresh to load latest news"
- Error state: Alert with error message

## Testing

**Update existing test** (`src/app/crawl/page.test.tsx`):
- Change "Lobsters" → "SOLIDOT" in panel title check
- Update component name regex: `LobstersPanel` → `SolidotPanel`
- Panel count remains 7

**New tests** (optional, can add later):
- `src/lib/solidot-parser.test.ts` - RSS parsing logic
- `src/lib/crawl-db.test.ts` - Add SOLIDOT cache CRUD tests
- `src/app/api/crawl/solidot/route.test.ts` - API route tests

**Manual testing checklist:**
- Panel loads and auto-fetches on mount
- Refresh button works
- News items display correctly (title, summary, timestamp, link)
- Cache works (second load is instant)
- Stale fallback works (disconnect network, refresh shows old data)
- Dark mode styling looks correct

## Implementation Notes

**Why RSS-optimized over Puppeteer:**
- RSS feeds are static XML, no JavaScript rendering
- Much lighter and faster than headless browser
- Lower resource usage
- Simpler error handling

**Why 60-minute cache:**
- SOLIDOT updates slower than financial news (Jin10)
- Reduces unnecessary RSS fetches
- Still provides reasonable freshness

**Consistency with existing patterns:**
- Database schema matches `arxiv_cache` / `jin10_cache`
- API route follows same caching strategy
- UI component mirrors Jin10Panel structure
- Error handling consistent across all panels

## Files to Modify/Create

**Create:**
- `src/lib/solidot-parser.ts` - RSS parser
- `src/app/api/crawl/solidot/route.ts` - API route

**Modify:**
- `src/lib/crawl-db.ts` - Add SOLIDOT cache functions
- `src/app/crawl/page.tsx` - Replace LobstersPanel with SolidotPanel
- `src/app/crawl/page.test.tsx` - Update panel name tests
- `docs/crawl-section.md` - Update documentation

**Database migration:**
- Create `solidot_cache` table (add to existing migration or create new one)
