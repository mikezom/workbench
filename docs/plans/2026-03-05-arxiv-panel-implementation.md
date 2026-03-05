# arXiv Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full arXiv API integration for the Crawl section's arXiv panel, replacing mock data with real search results from arXiv's API.

**Architecture:** Client component fetches from Next.js API route (`/api/crawl/arxiv`) which proxies to arXiv API (`export.arxiv.org/api/query`) and caches results in SQLite to avoid rate limiting.

**Tech Stack:** Next.js (App Router), SQLite (better-sqlite3), arXiv API (XML parsing), Vitest

---

### Task 1: Create arXiv API Route

**Files:**
- Create: `workbench/src/app/api/crawl/arxiv/route.ts`

**Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getArxivCache, createArxivCache } from "@/lib/crawl-db";

interface ArxivEntry {
  id: string;
  updated: string;
  published: string;
  title: string;
  summary: string;
  authors: { name: string }[];
  link: { href: string }[];
}

function parseArxivXml(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];

  // Simple XML parser - matches <entry> tags and extracts content
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entryContent = match[1];

    // Extract id (from <id> tag)
    const idMatch = entryContent.match(/<id>(.*?)<\/id>/);
    const id = idMatch ? idMatch[1].split("/").pop() || idMatch[1] : "";

    // Extract published date
    const publishedMatch = entryContent.match(/<published>(.*?)<\/published>/);
    const published = publishedMatch ? publishedMatch[1] : "";

    // Extract title
    const titleMatch = entryContent.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch
      ? titleMatch[1].replace(/\s+/g, " ").trim()
      : "No title";

    // Extract summary
    const summaryMatch = entryContent.match(/<summary>([\s\S]*?)<\/summary>/);
    const summary = summaryMatch
      ? summaryMatch[1].replace(/\s+/g, " ").trim()
      : "";

    // Extract authors
    const authors: { name: string }[] = [];
    const authorRegex = /<author>([\s\S]*?)<\/author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entryContent)) !== null) {
      const nameMatch = authorMatch[1].match(/<name>(.*?)<\/name>/);
      if (nameMatch) {
        authors.push({ name: nameMatch[1] });
      }
    }

    // Extract link
    const linkMatch = entryContent.match(
      /<link[^>]*href="([^"]*)"[^>]*\/>/
    );
    const link = linkMatch ? linkMatch[1] : "";

    entries.push({
      id,
      updated: "",
      published,
      title,
      summary,
      authors,
      link: [{ href: link }],
    });
  }

  return entries;
}

function toArxivPaper(entry: ArxivEntry) {
  return {
    id: entry.id,
    title: entry.title,
    authors: entry.authors.map((a) => a.name),
    summary: entry.summary,
    published: entry.published,
    link: entry.link[0]?.href || `https://arxiv.org/abs/${entry.id}`,
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  // Check cache first
  const cached = getArxivCache(query);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.results);
  }

  // Fetch from arXiv API
  try {
    const arxivUrl = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=10`;
    const response = await fetch(arxivUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`arXiv API returned ${response.status}`);
    }

    const xml = await response.text();
    const entries = parseArxivXml(xml);
    const papers = entries.slice(0, 10).map(toArxivPaper);

    // Cache the results
    createArxivCache({ query, results: papers });

    return NextResponse.json(papers);
  } catch (error) {
    console.error("Failed to fetch arXiv papers:", error);

    // Return cached results even if expired on error
    if (cached) {
      return NextResponse.json(cached.results, {
        status: 206, // Partial Content
        headers: {
          "X-Cached": "true",
        },
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch papers" },
      { status: 500 }
    );
  }
}
```

**Step 2: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
git add workbench/src/app/api/crawl/arxiv/route.ts
git commit -m "feat(crawl): add arXiv API proxy route with caching"
```

---

### Task 2: Update ArxivPanel to Use API Route

**Files:**
- Modify: `workbench/src/app/crawl/page.tsx`

**Step 1: Replace the mock `fetchPapers` function**

Find the `ArxivPanel` component's `fetchPapers` function (around line 31) and replace the entire function body with:

```typescript
  const fetchPapers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crawl/arxiv?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to fetch papers: ${response.status}`);
      }

      const data = await response.json();
      setPapers(data);
    } catch (error) {
      console.error("Failed to fetch papers:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Show error in UI by setting papers to empty and showing error state
      setPapers([]);
      // Could add error state here in the future
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };
```

**Step 2: Verify build passes**

Run: `cd workbench && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add workbench/src/app/crawl/page.tsx
git commit -m "feat(crawl): connect ArxivPanel to API route"
```

---

### Task 3: Add API Route Tests

**Files:**
- Create: `workbench/src/app/api/crawl/arxiv/route.test.ts`

**Step 1: Create the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

// Mock the crawl-db functions
vi.mock("@/lib/crawl-db", () => ({
  getArxivCache: vi.fn(),
  createArxivCache: vi.fn(),
}));

describe("arXiv API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when query parameter is missing", async () => {
    const request = new Request("http://localhost/api/crawl/arxiv");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("Query parameter");
  });

  it("returns cached results when cache is fresh", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    vi.mocked(getArxivCache).mockReturnValue({
      id: "cache-1",
      query: "cat:cs.AI",
      results: [
        {
          id: "2401.12345",
          title: "Cached Paper",
          authors: ["Author One"],
          summary: "A cached paper summary",
          published: "2024-01-01T00:00:00Z",
          link: "https://arxiv.org/abs/2401.12345",
        },
      ],
      result_count: 1,
      timestamp: Date.now(),
      created_at: "2024-01-01T00:00:00Z",
    });

    const request = new Request("http://localhost/api/crawl/arxiv?q=cat:cs.AI");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Cached Paper");
  });

  it("fetches from arXiv API when no cache exists", async () => {
    const { getArxivCache, createArxivCache } = await import("@/lib/crawl-db");
    vi.mocked(getArxivCache).mockReturnValue(undefined);
    vi.mocked(createArxivCache).mockReturnValue({} as any);

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    }) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalled();
    expect(createArxivCache).toHaveBeenCalled();
  });

  it("returns stale cache on error", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    const staleCache = {
      id: "cache-stale",
      query: "test",
      results: [{ title: "Stale Result" }],
      result_count: 1,
      timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(getArxivCache).mockReturnValue(staleCache);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(206);
    expect(response.headers.get("X-Cached")).toBe("true");
    expect(data).toHaveLength(1);
  });

  it("returns 500 on error with no cache", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    vi.mocked(getArxivCache).mockReturnValue(undefined);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to fetch");
  });
});

// Mock arXiv XML response
const mockArxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345</id>
    <published>2024-01-01T00:00:00Z</published>
    <title>Test Paper Title</title>
    <summary>This is a test summary.</summary>
    <author><name>Test Author</name></author>
    <link href="http://arxiv.org/abs/2401.12345" rel="alternate" type="text/html"/>
  </entry>
</feed>`;
```

**Step 2: Run tests**

Run: `cd workbench && npm test -- src/app/api/crawl/arxiv/route.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add workbench/src/app/api/crawl/arxiv/route.test.ts
git commit -m "test(crawl): add arXiv API route tests"
```

---

### Task 4: Add XML Parser Tests

**Files:**
- Create: `workbench/src/lib/crawl-arxiv-parser.test.ts`

**Step 1: Create the parser test file**

```typescript
import { describe, it, expect } from "vitest";

// Import the parser function (we'll need to export it from the route file)
import { parseArxivXml } from "../app/api/crawl/arxiv/route";

describe("parseArxivXml", () => {
  it("parses a single entry correctly", () => {
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.12345</id>
    <published>2024-01-15T10:30:00Z</published>
    <title>  Machine Learning for Good  </title>
    <summary>A paper about ML.</summary>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <link href="http://arxiv.org/abs/2401.12345" rel="alternate"/>
  </entry>
</feed>`;

    const results = parseArxivXml(xml);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2401.12345");
    expect(results[0].title).toBe("Machine Learning for Good");
    expect(results[0].authors).toEqual([
      { name: "Alice Smith" },
      { name: "Bob Jones" },
    ]);
    expect(results[0].summary).toBe("A paper about ML.");
  });

  it("handles multiple entries", () => {
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.00001</id>
    <published>2024-01-01T00:00:00Z</published>
    <title>First Paper</title>
    <summary>Summary one.</summary>
    <author><name>Author One</name></author>
    <link href="http://arxiv.org/abs/2401.00001" rel="alternate"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2401.00002</id>
    <published>2024-01-02T00:00:00Z</published>
    <title>Second Paper</title>
    <summary>Summary two.</summary>
    <author><name>Author Two</name></author>
    <link href="http://arxiv.org/abs/2401.00002" rel="alternate"/>
  </entry>
</feed>`;

    const results = parseArxivXml(xml);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("First Paper");
    expect(results[1].title).toBe("Second Paper");
  });

  it("handles missing fields gracefully", () => {
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.00000</id>
    <title>Minimal Entry</title>
  </entry>
</feed>`;

    const results = parseArxivXml(xml);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2401.00000");
    expect(results[0].title).toBe("Minimal Entry");
    expect(results[0].authors).toEqual([]);
  });

  it("normalizes whitespace in title and summary", () => {
    const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>http://arxiv.org/abs/2401.00000</id>
    <title>    Title   with   spaces   </title>
    <summary>Summary
with
newlines</summary>
  </entry>
</feed>`;

    const results = parseArxivXml(xml);

    expect(results[0].title).toBe("Title with spaces");
    expect(results[0].summary).toBe("Summary with newlines");
  });

  it("returns empty array for no entries", () => {
    const xml = `<?xml version="1.0"?>
<feed>
</feed>`;

    const results = parseArxivXml(xml);

    expect(results).toEqual([]);
  });
});
```

**Step 2: Export the parser function from the route**

Modify `workbench/src/app/api/crawl/arxiv/route.ts` to export the parser:

After the `parseArxivXml` function definition, change:
```typescript
function parseArxivXml(xml: string): ArxivEntry[] {
```

to:
```typescript
export function parseArxivXml(xml: string): ArxivEntry[] {
```

**Step 3: Run parser tests**

Run: `cd workbench && npm test -- src/lib/crawl-arxiv-parser.test.ts`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add workbench/src/app/api/crawl/arxiv/route.ts workbench/src/lib/crawl-arxiv-parser.test.ts
git commit -m "test(crawl): add XML parser unit tests"
```

---

### Task 5: Update crawl-section.md Documentation

**Files:**
- Modify: `workbench/docs/crawl-section.md`

**Step 1: Update the ArxivPanel description**

Find the section "## ArxivPanel (Only Functional Panel)" and update it:

Change the "Behavior" section from:

```
### Behavior

1. User enters a query (default: `cat:cs.AI`)
2. Clicks "Search" button
3. `fetchPapers()` sets loading state, populates with one mock paper
4. Papers render as cards with title, authors, summary (3-line clamp), date, and "View on arXiv" link

The `fetchPapers` function currently returns hardcoded mock data. The actual arXiv API integration is not yet implemented.
```

to:

```
### Behavior

1. User enters a query (default: `cat:cs.AI`)
2. Clicks "Search" button
3. `fetchPapers()` fetches from `/api/crawl/arxiv?q=...`
4. API route checks SQLite cache (5-minute TTL)
5. If no fresh cache: proxies to arXiv API, parses XML response, caches results
6. Papers render as cards with title, authors, summary (3-line clamp), date, and "View on arXiv" link
7. On error: shows stale cached results if available (206 status), otherwise alerts user

Caching reduces API calls and provides fallback on network errors. The arXiv API is called directly from the server to avoid CORS issues.
```

**Step 2: Update the Key Files table**

Change:
```
| `src/app/api/crawl/arxiv/route.ts` | arXiv API proxy — fetches and parses search results |
```

This should already exist — verify it's correct.

**Step 3: Add a section about Cache Management**

After the "ArxivPanel" section, add:

```
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
```

**Step 4: Commit**

```bash
git add workbench/docs/crawl-section.md
git commit -m "docs(crawl): update crawl-section.md with arXiv API implementation details"
```

---

### Task 6: Update PROGRESS.md

**Files:**
- Modify: `workbench/PROGRESS.md`

**Step 1: Add the arXiv panel phase**

Find the section listing phases (after "### Phase 5: Agent Section") and add:

```markdown
#### Phase 6: Crawl Section

- [x] arXiv panel with search UI (mock data)
- [x] arXiv cache database schema and functions
- [x] arXiv API proxy route with XML parsing
- [x] arXiv panel connected to API route
- [ ] Hacker News panel implementation
- [ ] Lobsters panel implementation
- [ ] nLab panel implementation
- [ ] Planet Haskell panel implementation
- [ ] Reddit panel implementation
```

**Step 2: Update status table**

In the status table near the top of the file, add a row for Phase 6:

```markdown
| Phase 6: Crawl Section | In progress | arXiv panel functional, others pending |
```

**Step 3: Commit**

```bash
git add workbench/PROGRESS.md
git commit -m "docs: update PROGRESS.md with arXiv panel completion status"
```

---

### Task 7: Final Build Validation

**Step 1: Run full build**

Run: `cd workbench && npm run build`
Expected: Build succeeds with zero errors.

**Step 2: Run all tests**

Run: `cd workbench && npm test`
Expected: All tests pass, including new arXiv tests.

**Step 3: Manual verification (optional but recommended)**

1. Start dev server: `cd workbench && npm run dev`
2. Navigate to `/crawl`
3. Enter a search query (e.g., `cat:cs.AI`) and click Search
4. Verify real arXiv papers are displayed
5. Try another query to verify cache behavior

---

## Summary

This plan implements a fully functional arXiv panel that:

1. **Fetches real data** from arXiv's public API
2. **Caches results** in SQLite to reduce API calls and provide fallback
3. **Parses XML responses** with a simple regex-based parser (no heavy dependencies)
4. **Handles errors** gracefully by falling back to stale cache
5. **Is tested** with unit tests for the parser and integration tests for the route

Total: 7 tasks, approximately 30-40 minutes to complete.
