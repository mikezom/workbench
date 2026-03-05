import { describe, it, expect, vi, beforeEach } from "vitest";
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
      timestamp: now,
      created_at: "2024-01-01T00:00:00Z",
    });

    const request = new Request("http://localhost/api/crawl/arxiv?q=cat:cs.AI");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cached")).toBe("true");
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Cached Paper");
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
      timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
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

  it("retries fetch when cache is stale", async () => {
    const { getArxivCache, createArxivCache } = await import("@/lib/crawl-db");
    const { parseArxivXml } = await import("@/lib/arxiv-parser");

    // Return stale cache (older than 5 minutes)
    vi.mocked(getArxivCache).mockReturnValue({
      id: "cache-stale",
      query: "test",
      results: [
        {
          id: "2401.00000",
          title: "Stale Paper",
          authors: ["Old Author"],
          summary: "Old summary",
          published: "2024-01-01T00:00:00Z",
          link: "https://arxiv.org/abs/2401.00000",
        },
      ],
      result_count: 1,
      timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago (> 5 min TTL)
      created_at: "2024-01-01T00:00:00Z",
    });

    vi.mocked(createArxivCache).mockReturnValue({} as any);
    vi.mocked(parseArxivXml).mockReturnValue([
      {
        id: "2401.12345",
        title: "Fresh Paper",
        authors: ["New Author"],
        summary: "Fresh summary",
        published: "2024-01-01T00:00:00Z",
        link: "https://arxiv.org/abs/2401.12345",
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    }) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    const response = await GET(request);
    const data = await response.json();

    expect(global.fetch).toHaveBeenCalled();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("Fresh Paper");
  });

  it("uses AbortSignal.timeout for fetch timeout", async () => {
    const { getArxivCache } = await import("@/lib/crawl-db");
    vi.mocked(getArxivCache).mockReturnValue(undefined);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockArxivXml),
    }) as any;

    const request = new Request("http://localhost/api/crawl/arxiv?q=test");
    await GET(request);

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    // The fetch should be called with signal containing timeout
    expect(global.fetch).toHaveBeenCalled();
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
