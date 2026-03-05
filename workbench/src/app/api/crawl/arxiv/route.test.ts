import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

// Mock the crawl-db functions
vi.mock("@/lib/crawl-db", () => ({
  getArxivCache: vi.fn(),
  createArxivCache: vi.fn(),
}));

// Mock the arxiv-parser module
vi.mock("@/lib/arxiv-parser", () => ({
  parseArxivXml: vi.fn(),
}));

// Cache TTL from route.ts
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

describe("arXiv API Route", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore global.fetch to avoid test pollution
    global.fetch = originalFetch;
  });

  it("returns 400 when query parameter is missing", async () => {
    const request = new Request("http://localhost/api/crawl/arxiv");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("Missing required parameter");
  });

  it("returns cached results when cache is fresh", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    const now = Date.now();
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
      timestamp: now - CACHE_TTL_MS / 2, // 2.5 minutes ago - still fresh
      created_at: "2024-01-01T00:00:00Z",
    });

    // Mock fetch to verify it's NOT called
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    }) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=cat:cs.AI");
    const response = await GET(request);
    const data = await response.json();

    // Clear fetch mock before assertion to avoid pollution
    vi.mocked(global.fetch).mockClear();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cached")).toBe("true");
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Cached Paper");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches from arXiv API when no cache exists", async () => {
    const { getArxivCache, createArxivCache } = await import("@/lib/crawl-db");
    const { parseArxivXml } = await import("@/lib/arxiv-parser");

    vi.mocked(getArxivCache).mockReturnValue(undefined);
    vi.mocked(createArxivCache).mockReturnValue({} as any);
    vi.mocked(parseArxivXml).mockReturnValue([
      {
        id: "2401.12345",
        title: "Fetched Paper",
        authors: ["Test Author"],
        summary: "A test summary",
        published: "2024-01-01T00:00:00Z",
        link: "https://arxiv.org/abs/2401.12345",
      },
    ]);

    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    }) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalled();
    expect(parseArxivXml).toHaveBeenCalledWith(mockArxivXml);
    expect(createArxivCache).toHaveBeenCalledWith({
      query: "test",
      results: expect.any(Array),
    });
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Fetched Paper");
  });

  it("returns stale cache on error", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    const staleCache = {
      id: "cache-stale",
      query: "test",
      results: [
        {
          id: "2401.12345",
          title: "Stale Result",
          authors: ["Test Author"],
          summary: "A stale summary",
          published: "2024-01-01T00:00:00Z",
          link: "https://arxiv.org/abs/2401.12345",
        },
      ],
      result_count: 1,
      timestamp: Date.now() - CACHE_TTL_MS * 2, // 10 minutes ago - stale
      created_at: "2024-01-01T00:00:00Z",
    };
    vi.mocked(getArxivCache).mockReturnValue(staleCache);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(206);
    expect(response.headers.get("X-Cached")).toBe("stale");
    expect(response.headers.get("X-Error")).toBe(
      "Failed to fetch from arXiv API, serving stale cache"
    );
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Stale Result");
  });

  it("returns 500 on error with no cache", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    vi.mocked(getArxivCache).mockReturnValue(undefined);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to fetch from arXiv API");
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
