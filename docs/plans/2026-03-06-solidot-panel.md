# SOLIDOT Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Lobsters panel stub with fully functional SOLIDOT news panel that fetches from RSS feed with 60-minute database caching.

**Architecture:** RSS-optimized approach using native XML parsing (no Puppeteer). Follows Jin10 pattern: database caching with stale fallback, auto-fetch on mount + manual refresh button. Cache TTL is 60 minutes (vs 5 minutes for Jin10) since SOLIDOT updates slower.

**Tech Stack:** Next.js App Router, TypeScript, better-sqlite3, native XML parsing (DOMParser/xml2js)

---

## Task 1: Database Schema & Functions

**Files:**
- Modify: `workbench/src/lib/crawl-db.ts` (add SOLIDOT types and functions)

**Step 1: Add SOLIDOT table to schema**

In `initCrawlSchema()` function, add after the jin10_cache table creation:

```typescript
CREATE TABLE IF NOT EXISTS solidot_cache (
  id          TEXT PRIMARY KEY,
  query       TEXT NOT NULL,
  results     TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_solidot_cache_query
  ON solidot_cache(query);

CREATE INDEX IF NOT EXISTS idx_solidot_cache_timestamp
  ON solidot_cache(timestamp);
```

**Step 2: Add SOLIDOT types**

Add after Jin10 types section (around line 115):

```typescript
// ---------------------------------------------------------------------------
// SOLIDOT Types
// ---------------------------------------------------------------------------

export interface SolidotNewsItem {
  id: string;
  title: string;
  link: string;
  timestamp: string;
  summary?: string;
}

export interface DbSolidotCache {
  id: string;
  query: string;
  results: string;
  result_count: number;
  timestamp: number;
  created_at: string;
}

export interface SolidotCacheJson {
  id: string;
  query: string;
  results: SolidotNewsItem[];
  result_count: number;
  timestamp: number;
  created_at: string;
}

function toSolidotCacheJson(row: DbSolidotCache): SolidotCacheJson {
  return {
    id: row.id,
    query: row.query,
    results: JSON.parse(row.results),
    result_count: row.result_count,
    timestamp: row.timestamp,
    created_at: row.created_at,
  };
}
```

**Step 3: Add SOLIDOT database functions**

Add at the end of the file (after Jin10 functions):

```typescript
// ---------------------------------------------------------------------------
// SOLIDOT Queries
// ---------------------------------------------------------------------------

export function createSolidotCache(data: {
  results: SolidotNewsItem[];
}): SolidotCacheJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.getTime();
  const created_at = now.toISOString();
  const query = "latest"; // Always use "latest" for SOLIDOT
  const resultsJson = JSON.stringify(data.results);
  const result_count = data.results.length;

  db.prepare(
    `INSERT INTO solidot_cache (id, query, results, result_count, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, query, resultsJson, result_count, timestamp, created_at);

  return getSolidotCacheById(id)!;
}

export function getSolidotCache(): SolidotCacheJson | undefined {
  const db = getDb();
  const query = "latest";
  const row = db
    .prepare(
      "SELECT * FROM solidot_cache WHERE query = ? ORDER BY timestamp DESC LIMIT 1"
    )
    .get(query) as DbSolidotCache | undefined;
  return row ? toSolidotCacheJson(row) : undefined;
}

function getSolidotCacheById(id: string): SolidotCacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM solidot_cache WHERE id = ?")
    .get(id) as DbSolidotCache | undefined;
  return row ? toSolidotCacheJson(row) : undefined;
}

export function deleteExpiredSolidotCache(beforeTimestamp: number): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM solidot_cache WHERE timestamp < ?")
    .run(beforeTimestamp);
  return result.changes;
}
```

**Step 4: Run dev server to verify schema creation**

Run: `cd workbench && npm run dev`

Expected: Server starts without errors, database table created automatically

**Step 5: Commit**

```bash
git add workbench/src/lib/crawl-db.ts
git commit -m "feat(crawl): add SOLIDOT cache database schema and functions"
```

---

## Task 2: RSS Parser

**Files:**
- Create: `workbench/src/lib/solidot-parser.ts`

**Step 1: Create RSS parser file**

Create `workbench/src/lib/solidot-parser.ts`:

```typescript
import { SolidotNewsItem } from "./crawl-db";

/**
 * Fetch and parse SOLIDOT RSS feed
 * @returns Array of news items (up to 20)
 */
export async function fetchSolidotRSS(): Promise<SolidotNewsItem[]> {
  try {
    console.log("Fetching SOLIDOT RSS feed...");

    // Fetch RSS XML with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://www.solidot.org/index.rss", {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WorkbenchBot/1.0)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    console.log("RSS feed fetched, parsing XML...");

    // Parse XML using DOMParser (works in Node.js 18+)
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for parse errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
      console.error("XML parse error:", parseError.textContent);
      return [];
    }

    // Extract items
    const items = xmlDoc.querySelectorAll("item");
    const newsItems: SolidotNewsItem[] = [];

    items.forEach((item, index) => {
      if (index >= 20) return; // Limit to 20 items

      const title = item.querySelector("title")?.textContent?.trim();
      const link = item.querySelector("link")?.textContent?.trim();
      const pubDate = item.querySelector("pubDate")?.textContent?.trim();
      const description = item.querySelector("description")?.textContent?.trim();
      const guid = item.querySelector("guid")?.textContent?.trim();

      if (title && link) {
        // Generate ID from link or guid
        const id = guid || link;

        // Format timestamp
        const timestamp = pubDate ? formatRSSDate(pubDate) : "";

        newsItems.push({
          id,
          title,
          link,
          timestamp,
          summary: description || undefined,
        });
      }
    });

    console.log(`Parsed ${newsItems.length} items from SOLIDOT RSS`);
    return newsItems;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("SOLIDOT RSS fetch timeout");
    } else {
      console.error("Error fetching SOLIDOT RSS:", error);
    }
    return [];
  }
}

/**
 * Format RFC 822 date to readable string
 * Example: "Thu, 06 Mar 2026 14:30:00 +0800" -> "2026-03-06 14:30"
 */
function formatRSSDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString; // Return original if parse fails
    }

    // Format as YYYY-MM-DD HH:MM
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
}
```

**Step 2: Install DOMParser polyfill for Node.js**

DOMParser is not available in Node.js by default. Install a polyfill:

Run: `cd workbench && npm install xmldom`

**Step 3: Update parser to use xmldom**

Replace the DOMParser line in `solidot-parser.ts`:

```typescript
import { DOMParser } from "xmldom";
```

**Step 4: Test parser manually (optional)**

Create a test script or use Node REPL:

```bash
cd workbench
node -e "import('./src/lib/solidot-parser.ts').then(m => m.fetchSolidotRSS().then(console.log))"
```

Expected: Array of news items printed (or empty array if network issues)

**Step 5: Commit**

```bash
git add workbench/src/lib/solidot-parser.ts workbench/package.json workbench/package-lock.json
git commit -m "feat(crawl): add SOLIDOT RSS parser with xmldom"
```

---

## Task 3: API Route

**Files:**
- Create: `workbench/src/app/api/crawl/solidot/route.ts`

**Step 1: Create API route file**

Create `workbench/src/app/api/crawl/solidot/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSolidotCache, createSolidotCache } from "@/lib/crawl-db";
import { fetchSolidotRSS } from "@/lib/solidot-parser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET() {
  const now = Date.now();

  // Check cache first
  const cached = getSolidotCache();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    // Return fresh cache
    return NextResponse.json(cached.results, {
      headers: {
        "X-Cached": "true",
        "X-Cache-Age": String(now - cached.timestamp),
      },
    });
  }

  // Fetch from SOLIDOT RSS
  try {
    console.log("Fetching fresh SOLIDOT news...");

    const news = await fetchSolidotRSS();

    console.log(`Fetched ${news.length} items from SOLIDOT`);

    // Cache the results
    try {
      createSolidotCache({ results: news });
    } catch (cacheError) {
      console.error("Failed to cache SOLIDOT results:", cacheError);
      // Continue anyway - return results to user
    }

    return NextResponse.json(news);
  } catch (error) {
    // On fetch error, return stale cache with status 206 if available
    if (cached) {
      console.log("Fetch failed, returning stale cache");
      return NextResponse.json(cached.results, {
        status: 206,
        headers: {
          "X-Cached": "stale",
          "X-Cache-Age": String(now - cached.timestamp),
          "X-Error": "Failed to fetch from SOLIDOT, serving stale cache",
        },
      });
    }

    // On error with no cache, return 500
    console.error("Error fetching from SOLIDOT:", error);
    return NextResponse.json(
      { error: "Failed to fetch SOLIDOT news" },
      { status: 500 }
    );
  }
}
```

**Step 2: Test API route**

Run: `cd workbench && npm run dev`

Then in another terminal:
```bash
curl http://localhost:3000/api/crawl/solidot
```

Expected: JSON array of news items (or empty array)

**Step 3: Test cache behavior**

Run the curl command again immediately:

Expected: Same results returned instantly with `X-Cached: true` header

**Step 4: Commit**

```bash
git add workbench/src/app/api/crawl/solidot/route.ts
git commit -m "feat(crawl): add SOLIDOT API route with 60-min caching"
```

---

## Task 4: UI Component

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx` (replace LobstersPanel with SolidotPanel)

**Step 1: Add SolidotNewsItem type to page.tsx**

In the Types section (around line 7), add after Jin10NewsItem:

```typescript
interface SolidotNewsItem {
  id: string;
  title: string;
  link: string;
  timestamp: string;
  summary?: string;
}
```

**Step 2: Replace LobstersPanel with SolidotPanel**

Find the `LobstersPanel` function (around line 299) and replace it entirely with:

```typescript
/* ------------------------------------------------------------------ */
/*  SolidotPanel                                                       */
/* ------------------------------------------------------------------ */

function SolidotPanel() {
  const [news, setNews] = useState<SolidotNewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crawl/solidot");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch news: ${response.status}`);
      }

      const data = await response.json();
      setNews(data);
    } catch (error) {
      console.error("Failed to fetch SOLIDOT news:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setNews([]);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/50 flex flex-col h-full min-h-0">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[rgb(0,77,77)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          SOLIDOT
        </span>
        {news.length > 0 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            ({news.length})
          </span>
        )}
      </div>

      {/* Refresh Button */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={fetchNews}
          disabled={loading}
          className="w-full px-4 py-2 text-sm bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* News List */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-600 scrollbar-track-transparent hover:scrollbar-thumb-neutral-400 dark:hover:scrollbar-thumb-neutral-500">
        <style>{`
          .scrollbar-thin::-webkit-scrollbar {
            width: 6px;
          }
          .scrollbar-thin::-webkit-scrollbar-track {
            background: transparent;
          }
          .scrollbar-thin::-webkit-scrollbar-thumb {
            border-radius: 3px;
            background-color: rgb(212 212 212);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb {
            background-color: rgb(82 82 82);
          }
          .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(163 163 163);
          }
          .dark .scrollbar-thin:hover::-webkit-scrollbar-thumb {
            background-color: rgb(107 107 107);
          }
          .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(120 120 120);
          }
          .dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
            background-color: rgb(156 163 175);
          }
        `}</style>
        {news.length === 0 && !loading && (
          <p className="text-xs text-neutral-300 dark:text-neutral-600 text-center py-4">
            Click Refresh to load latest news
          </p>
        )}
        {news.map((item) => (
          <div
            key={item.id}
            className="border border-neutral-300 dark:border-neutral-700 rounded-lg p-3 bg-white dark:bg-neutral-800 space-y-2"
          >
            <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              {item.title}
            </h3>
            {item.summary && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3">
                {item.summary}
              </p>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                {item.timestamp}
              </span>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[rgb(0,77,77)] dark:text-[rgb(0,150,150)] hover:underline"
              >
                →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Update component usage in main grid**

Find the main page grid (around line 400+) and replace `<LobstersPanel />` with `<SolidotPanel />`.

**Step 4: Test in browser**

Run: `cd workbench && npm run dev`

Open: `http://localhost:3000/crawl`

Expected:
- SOLIDOT panel visible with dark teal dot
- Auto-fetches news on load
- Refresh button works
- News items display with title, summary, timestamp, link
- Dark mode works correctly

**Step 5: Commit**

```bash
git add workbench/src/app/crawl/page.tsx
git commit -m "feat(crawl): replace Lobsters panel with SOLIDOT panel"
```

---

## Task 5: Update Tests

**Files:**
- Modify: `workbench/src/app/crawl/page.test.tsx`

**Step 1: Update panel name test**

Find the test that checks for "Lobsters" and replace with "SOLIDOT":

```typescript
expect(source).toContain("SOLIDOT");
```

**Step 2: Update component name regex**

Find the regex that matches `LobstersPanel` and replace with `SolidotPanel`:

```typescript
const componentMatches = source.match(/function\s+(\w+Panel)\s*\(/g);
// Should match: ArxivPanel, Jin10Panel, SolidotPanel, NLabPanel, PlanetHaskellPanel, RedditPanel
```

**Step 3: Run tests**

Run: `cd workbench && npm test`

Expected: All tests pass

**Step 4: Commit**

```bash
git add workbench/src/app/crawl/page.test.tsx
git commit -m "test(crawl): update tests for SOLIDOT panel"
```

---

## Task 6: Update Documentation

**Files:**
- Modify: `workbench/docs/crawl-section.md`

**Step 1: Update Content Sources table**

Find the "Content Sources (Panels)" table and replace the Lobsters row:

```markdown
| Panel | Color Indicator | Status | External Source |
|-------|----------------|--------|----------------|
| ArxivPanel | Blue | Functional with API + caching | arXiv API (`export.arxiv.org/api/query`) |
| Jin10Panel | Yellow | Functional with scraping + caching | Jin10 (`www.jin10.com`) |
| SolidotPanel | Dark Teal (RGB 0,77,77) | Functional with RSS + caching | SOLIDOT (`www.solidot.org/index.rss`) |
| HackerNewsPanel | Orange | Stub ("Coming soon") | HN API (`hacker-news.firebaseio.com`) |
| NLabPanel | Green | Stub ("Coming soon") | nLab (`ncatlab.org`) |
| PlanetHaskellPanel | Purple | Stub ("Coming soon") | Planet Haskell (`planet.haskell.org`) |
| RedditPanel | Light Blue | Stub ("Coming soon") | Reddit API |
```

**Step 2: Add SOLIDOT Panel section**

After the Jin10 Panel section, add:

```markdown
## SOLIDOT Panel

Displays latest tech news from [SOLIDOT](https://www.solidot.org/), a Chinese technology news aggregator.

### Features

- Auto-fetch on mount
- Manual refresh button
- 60-minute cache with stale fallback
- Full display (title, summary, timestamp, link)
- RSS-optimized (no Puppeteer)

### Architecture

- **Parser**: `src/lib/solidot-parser.ts` - RSS XML parsing with xmldom
- **API Route**: `src/app/api/crawl/solidot/route.ts` - Caching proxy
- **Database**: `solidot_cache` table in SQLite
- **UI**: `SolidotPanel` component in `src/app/crawl/page.tsx`

### Cache Strategy

- TTL: 60 minutes (slower update frequency than Jin10)
- Stale fallback: Returns old cache if RSS fetch fails
- Query key: Always "latest" (no search functionality)

### Error Handling

- Network timeout: 10 seconds
- Fetch failure with cache: Returns 206 with stale data
- Fetch failure without cache: Returns 500 error
- Parse failure: Returns empty array
```

**Step 3: Update Key Files table**

Add SOLIDOT files to the table:

```markdown
| File | Purpose |
|------|---------|
| `src/app/crawl/page.tsx` | Entire Crawl UI — all panel sub-components in one file |
| `src/app/crawl/page.test.tsx` | Static tests verifying 7 panels exist with correct titles |
| `src/app/api/crawl/arxiv/route.ts` | arXiv API proxy — fetches and parses search results |
| `src/app/api/crawl/jin10/route.ts` | Jin10 API proxy — scrapes and caches financial news |
| `src/app/api/crawl/solidot/route.ts` | SOLIDOT API proxy — fetches and caches RSS news |
| `src/lib/crawl-db.ts` | Database operations for arXiv, Jin10, and SOLIDOT cache |
| `src/lib/crawl-db.test.ts` | Tests for cache CRUD operations |
| `src/lib/jin10-scraper.ts` | Puppeteer scraper for Jin10 news content |
| `src/lib/solidot-parser.ts` | RSS parser for SOLIDOT news content |
| `data/crawls.json` | Empty JSON array — unused placeholder for future persistence |
```

**Step 4: Commit**

```bash
git add workbench/docs/crawl-section.md
git commit -m "docs(crawl): update documentation for SOLIDOT panel"
```

---

## Task 7: Update PROGRESS.md

**Files:**
- Modify: `workbench/PROGRESS.md`

**Step 1: Update Phase 6 checklist**

Find the "Phase 6: Crawl Section" checklist and add:

```markdown
- [x] SOLIDOT panel implementation (database, parser, API, UI)
```

**Step 2: Update Status table**

Update the Phase 6 status:

```markdown
| 6 - Crawl | In progress | ArxivPanel + Jin10Panel + SolidotPanel functional; commit `<hash>` |
```

**Step 3: Commit**

```bash
git add workbench/PROGRESS.md
git commit -m "docs: update PROGRESS.md for SOLIDOT panel completion"
```

---

## Manual Testing Checklist

After all tasks complete, verify:

1. **Panel loads correctly**
   - Navigate to `/crawl`
   - SOLIDOT panel visible with dark teal dot
   - Label shows "SOLIDOT" in all caps

2. **Auto-fetch works**
   - News items load automatically on page load
   - Loading state shows "Loading..." button text

3. **Refresh button works**
   - Click Refresh button
   - Loading state appears
   - News items update

4. **Cache works**
   - Refresh page (F5)
   - News loads instantly (from cache)
   - Check browser DevTools Network tab: 200 response with `X-Cached: true` header

5. **News display correct**
   - Each item shows title, summary (if available), timestamp, link
   - Link arrow (→) is dark teal color
   - Clicking link opens in new tab

6. **Dark mode works**
   - Toggle dark mode
   - Panel background, text, borders all themed correctly
   - Link color adjusts for dark mode

7. **Stale fallback works** (optional)
   - Disconnect network
   - Click Refresh
   - Old cached data still displays (206 status)

8. **Error handling works** (optional)
   - Clear cache (delete database)
   - Disconnect network
   - Click Refresh
   - Error alert appears

---

## Notes

- **DOMParser polyfill**: xmldom package provides DOMParser for Node.js since it's not available natively
- **60-minute cache**: Longer than Jin10 (5 min) since SOLIDOT updates slower
- **RSS simplicity**: Much simpler than Jin10's Puppeteer approach - RSS is static XML
- **Color consistency**: Dark teal (RGB 0,77,77) used for dot and link color
- **Pattern consistency**: Follows Jin10 pattern exactly (auto-fetch + refresh + caching + stale fallback)
