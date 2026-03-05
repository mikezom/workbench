# JIN10 NEWS Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace HackerNewsPanel stub with functional Jin10Panel displaying real financial news from jin10.com with server-side HTML scraping, database caching, and clean UI.

**Architecture:** Server-side HTML scraping → Parser → Database cache (5-min TTL) → API route → React UI component. Follows ArxivPanel pattern with stale cache fallback for reliability.

**Tech Stack:** Next.js 14, TypeScript, better-sqlite3, React hooks, Tailwind CSS

---

### Task 1: Database Schema and Types

**Files:**
- Modify: `workbench/src/lib/crawl-db.ts`

**Step 1: Add Jin10NewsItem type definition**

Add after the ArxivCacheJson interface (around line 47):

```typescript
// ---------------------------------------------------------------------------
// Jin10 Types
// ---------------------------------------------------------------------------

export interface Jin10NewsItem {
  id: string;
  title: string;
  timestamp: string;
  summary?: string;
  link?: string;
}

export interface DbJin10Cache {
  id: string;
  query: string;
  results: string;
  result_count: number;
  timestamp: number;
  created_at: string;
}

export interface Jin10CacheJson {
  id: string;
  query: string;
  results: Jin10NewsItem[];
  result_count: number;
  timestamp: number;
  created_at: string;
}

function toJin10CacheJson(row: DbJin10Cache): Jin10CacheJson {
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

**Step 2: Add jin10_cache table to schema**

Modify `initCrawlSchema` function to add jin10_cache table after arxiv_cache:

```typescript
export function initCrawlSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arxiv_cache (
      id          TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      results     TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      timestamp   INTEGER NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_arxiv_cache_query
      ON arxiv_cache(query);

    CREATE INDEX IF NOT EXISTS idx_arxiv_cache_timestamp
      ON arxiv_cache(timestamp);

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
```

**Step 3: Add Jin10 CRUD functions**

Add at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Jin10 Queries
// ---------------------------------------------------------------------------

export function createJin10Cache(data: {
  results: Jin10NewsItem[];
}): Jin10CacheJson {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.getTime();
  const created_at = now.toISOString();
  const query = "latest"; // Always use "latest" for Jin10
  const resultsJson = JSON.stringify(data.results);
  const result_count = data.results.length;

  db.prepare(
    `INSERT INTO jin10_cache (id, query, results, result_count, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, query, resultsJson, result_count, timestamp, created_at);

  return getJin10CacheById(id)!;
}

export function getJin10Cache(): Jin10CacheJson | undefined {
  const db = getDb();
  const query = "latest";
  const row = db
    .prepare(
      "SELECT * FROM jin10_cache WHERE query = ? ORDER BY timestamp DESC LIMIT 1"
    )
    .get(query) as DbJin10Cache | undefined;
  return row ? toJin10CacheJson(row) : undefined;
}

function getJin10CacheById(id: string): Jin10CacheJson | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM jin10_cache WHERE id = ?")
    .get(id) as DbJin10Cache | undefined;
  return row ? toJin10CacheJson(row) : undefined;
}

export function deleteExpiredJin10Cache(beforeTimestamp: number): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM jin10_cache WHERE timestamp < ?")
    .run(beforeTimestamp);
  return result.changes;
}
```

**Step 4: Verify database changes**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 5: Commit**

```bash
cd workbench
git add src/lib/crawl-db.ts
git commit -m "feat(crawl): add jin10_cache database schema and CRUD functions"
```

---

### Task 2: HTML Parser

**Files:**
- Create: `workbench/src/lib/jin10-parser.ts`

**Step 1: Create parser file with basic structure**

```typescript
import { Jin10NewsItem } from "./crawl-db";

/**
 * Parse HTML from jin10.com homepage and extract news items
 * @param html Raw HTML string from jin10.com
 * @returns Array of news items (max 20)
 */
export function parseJin10Html(html: string): Jin10NewsItem[] {
  try {
    const items: Jin10NewsItem[] = [];

    // Jin10 uses a news list structure - we'll extract items using regex
    // Pattern: look for news items in the HTML structure
    // This is a simplified parser - adjust based on actual HTML structure

    // Match news item blocks (adjust regex based on actual HTML)
    const itemPattern = /<div[^>]*class="[^"]*news-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const titlePattern = /<[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const timePattern = /<[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const summaryPattern = /<[^>]*class="[^"]*summary[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const linkPattern = /href="([^"]*)"/i;

    let match;
    let count = 0;

    while ((match = itemPattern.exec(html)) !== null && count < 20) {
      const itemHtml = match[1];

      const titleMatch = titlePattern.exec(itemHtml);
      const timeMatch = timePattern.exec(itemHtml);

      if (titleMatch && timeMatch) {
        const title = stripHtml(titleMatch[1]).trim();
        const timestamp = stripHtml(timeMatch[1]).trim();

        if (title && timestamp) {
          const summaryMatch = summaryPattern.exec(itemHtml);
          const linkMatch = linkPattern.exec(itemHtml);

          items.push({
            id: crypto.randomUUID(),
            title,
            timestamp,
            summary: summaryMatch ? stripHtml(summaryMatch[1]).trim() : undefined,
            link: linkMatch ? linkMatch[1] : undefined,
          });

          count++;
        }
      }
    }

    return items;
  } catch (error) {
    console.error("Error parsing Jin10 HTML:", error);
    return [];
  }
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
```

**Step 2: Verify parser compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd workbench
git add src/lib/jin10-parser.ts
git commit -m "feat(crawl): add jin10 HTML parser"
```

---

### Task 3: API Route

**Files:**
- Create: `workbench/src/app/api/crawl/jin10/route.ts`

**Step 1: Create API route file**

```typescript
import { NextResponse } from "next/server";
import { getJin10Cache, createJin10Cache } from "@/lib/crawl-db";
import { parseJin10Html } from "@/lib/jin10-parser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const JIN10_URL = "https://www.jin10.com/";
const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET() {
  const now = Date.now();

  // Check cache first
  const cached = getJin10Cache();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    // Return fresh cache
    return NextResponse.json(cached.results, {
      headers: {
        "X-Cached": "true",
        "X-Cache-Age": String(now - cached.timestamp),
      },
    });
  }

  // Fetch from Jin10
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(JIN10_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WorkbenchCrawl/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jin10 returned ${response.status}`);
    }

    const html = await response.text();
    const news = parseJin10Html(html);

    // Cache the results
    try {
      createJin10Cache({ results: news });
    } catch (cacheError) {
      console.error("Failed to cache Jin10 results:", cacheError);
      // Continue anyway - return results to user
    }

    return NextResponse.json(news);
  } catch (error) {
    // On fetch error, return stale cache with status 206 if available
    if (cached) {
      return NextResponse.json(cached.results, {
        status: 206,
        headers: {
          "X-Cached": "stale",
          "X-Cache-Age": String(now - cached.timestamp),
          "X-Error": "Failed to fetch from Jin10, serving stale cache",
        },
      });
    }

    // On error with no cache, return 500
    console.error("Error fetching from Jin10:", error);
    return NextResponse.json(
      { error: "Failed to fetch from Jin10" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify API route compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd workbench
git add src/app/api/crawl/jin10/route.ts
git commit -m "feat(crawl): add jin10 API route with caching"
```

---

### Task 4: UI Component

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx`

**Step 1: Add Jin10NewsItem type**

Add after ArxivPaper interface (around line 16):

```typescript
interface Jin10NewsItem {
  id: string;
  title: string;
  timestamp: string;
  summary?: string;
  link?: string;
}
```

**Step 2: Replace HackerNewsPanel with Jin10Panel**

Replace the entire HackerNewsPanel function (lines 162-178) with:

```typescript
/* ------------------------------------------------------------------ */
/*  Jin10Panel                                                        */
/* ------------------------------------------------------------------ */

function Jin10Panel() {
  const [news, setNews] = useState<Jin10NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crawl/jin10");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch news: ${response.status}`);
      }

      const data = await response.json();
      setNews(data);
    } catch (error) {
      console.error("Failed to fetch Jin10 news:", error);
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
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          JIN10 NEWS
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
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {item.timestamp}
            </p>
            {item.summary && (
              <p className="text-xs text-neutral-700 dark:text-neutral-300 line-clamp-3">
                {item.summary}
              </p>
            )}
            {item.link && (
              <div className="flex justify-end">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  →
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Update panel grid to use Jin10Panel**

Change line 283 from `<HackerNewsPanel />` to `<Jin10Panel />`

**Step 4: Verify UI compiles**

Run: `cd workbench && npm run build`
Expected: Build succeeds

**Step 5: Test in browser**

Run: `cd workbench && npm run dev`
Navigate to: `http://localhost:3000/crawl`
Expected: Jin10Panel shows with Refresh button, clicking it attempts to fetch news

**Step 6: Commit**

```bash
cd workbench
git add src/app/crawl/page.tsx
git commit -m "feat(crawl): replace HackerNewsPanel with Jin10Panel"
```

---

### Task 5: Parser Refinement (After Testing)

**Context:** The initial parser uses generic patterns. After testing with real Jin10 HTML, we need to refine the regex patterns to match the actual structure.

**Files:**
- Modify: `workbench/src/lib/jin10-parser.ts`

**Step 1: Fetch real HTML for analysis**

Run in browser console on https://www.jin10.com/:
```javascript
copy(document.documentElement.outerHTML)
```

**Step 2: Analyze HTML structure**

Look for:
- News item container class names
- Title element structure
- Timestamp format and location
- Summary/content structure
- Link patterns

**Step 3: Update parser patterns**

Update the regex patterns in `parseJin10Html` based on actual HTML structure. Example adjustments:

```typescript
// Adjust these patterns based on actual HTML
const itemPattern = /<actual-pattern-here>/gi;
const titlePattern = /<actual-pattern-here>/i;
// ... etc
```

**Step 4: Test parser with real HTML**

Create a test file to verify parsing:

```typescript
// Quick test
const html = `<paste real HTML here>`;
const items = parseJin10Html(html);
console.log(items);
```

**Step 5: Verify parsing works**

Run: `cd workbench && npm run dev`
Test: Click Refresh in Jin10Panel
Expected: News items appear with titles, timestamps, and optional summaries

**Step 6: Commit**

```bash
cd workbench
git add src/lib/jin10-parser.ts
git commit -m "fix(crawl): refine jin10 parser patterns for actual HTML structure"
```

---

### Task 6: Error Handling and Edge Cases

**Files:**
- Modify: `workbench/src/lib/jin10-parser.ts`
- Modify: `workbench/src/app/api/crawl/jin10/route.ts`

**Step 1: Add parser error logging**

In `jin10-parser.ts`, enhance error handling:

```typescript
export function parseJin10Html(html: string): Jin10NewsItem[] {
  try {
    const items: Jin10NewsItem[] = [];

    // ... parsing logic ...

    if (items.length === 0) {
      console.warn("Jin10 parser: No items extracted from HTML");
    }

    return items;
  } catch (error) {
    console.error("Error parsing Jin10 HTML:", error);
    console.error("HTML length:", html.length);
    return [];
  }
}
```

**Step 2: Test error scenarios**

Test cases:
1. Network timeout (wait 10+ seconds)
2. Invalid HTML response
3. Empty response
4. Cache hit (refresh within 5 minutes)
5. Stale cache fallback (disconnect network, refresh after 5 minutes)

**Step 3: Verify error messages**

Expected behaviors:
- Timeout: Shows stale cache or error alert
- Invalid HTML: Returns empty array, shows empty state
- Cache hit: Returns immediately with X-Cached header
- Stale cache: Returns 206 status with X-Error header

**Step 4: Commit**

```bash
cd workbench
git add src/lib/jin10-parser.ts src/app/api/crawl/jin10/route.ts
git commit -m "feat(crawl): enhance jin10 error handling and logging"
```

---

### Task 7: Documentation

**Files:**
- Modify: `workbench/docs/crawl-section.md` (if exists)
- Create: `workbench/docs/crawl-section.md` (if doesn't exist)

**Step 1: Document Jin10Panel**

Add or update documentation:

```markdown
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
```

**Step 2: Commit**

```bash
cd workbench
git add docs/crawl-section.md
git commit -m "docs(crawl): add jin10 panel documentation"
```

---

### Task 8: Final Testing and Cleanup

**Step 1: Run full test suite**

Run: `cd workbench && npm test`
Expected: All tests pass (if tests exist)

**Step 2: Run build**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no errors or warnings

**Step 3: Manual testing checklist**

Test in browser:
- [ ] Fresh load: Jin10Panel auto-fetches on mount
- [ ] Refresh button: Manual refresh works
- [ ] Loading state: Shows "Loading..." during fetch
- [ ] News display: Items show with title, timestamp
- [ ] Summary display: Shows when available, omitted when not
- [ ] Link display: Shows "→" when link exists
- [ ] Empty state: Shows "Click Refresh to load latest news"
- [ ] Error state: Shows alert on fetch failure
- [ ] Dark mode: All colors and contrast work
- [ ] Cache: Second refresh within 5 min is instant

**Step 4: Check for unused code**

Verify HackerNewsPanel is completely removed and no references remain.

**Step 5: Final commit**

```bash
cd workbench
git add -A
git commit -m "test(crawl): verify jin10 panel functionality"
```

---

## Success Criteria

- [x] Jin10Panel displays real financial news from JIN10
- [x] Caching works correctly (5-min TTL, stale fallback)
- [x] UI matches ArxivPanel's quality and consistency
- [x] Build succeeds with no errors
- [x] Documentation updated
- [x] No regressions in other crawl panels

## Notes

- The parser uses regex patterns that may need adjustment based on Jin10's actual HTML structure
- Jin10 content is primarily in Chinese - ensure proper UTF-8 handling
- The site structure may change over time - parser may need periodic updates
- Consider adding unit tests for parser and API route in future iterations
