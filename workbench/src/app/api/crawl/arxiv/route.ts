import { NextRequest, NextResponse } from "next/server";
import { getArxivCache, createArxivCache } from "@/lib/crawl-db";
import { parseArxivXml, ArxivPaper } from "@/lib/arxiv-parser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ARXIV_API_URL = "http://export.arxiv.org/api/query";
const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds

/**
 * Convert arXiv XML paper to ArxivPaper type.
 * This is a passthrough function that validates the structure.
 */
function toArxivPaper(paper: ArxivPaper): ArxivPaper {
  return {
    id: paper.id,
    published: paper.published,
    title: paper.title,
    summary: paper.summary,
    authors: paper.authors,
    link: paper.link,
  };
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  // Return 400 if query parameter 'q' is missing
  if (!query) {
    return NextResponse.json(
      { error: "Missing required parameter: q" },
      { status: 400 }
    );
  }

  const now = Date.now();

  // Check cache first
  const cached = getArxivCache(query);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    // Return fresh cache
    return NextResponse.json(cached.results, {
      headers: {
        "X-Cached": "true",
        "X-Cache-Age": String(now - cached.timestamp),
      },
    });
  }

  // Fetch from arXiv API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url = `${ARXIV_API_URL}?search_query=${encodeURIComponent(query)}&start=0&max_results=10`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WorkbenchCrawl/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`arXiv API returned ${response.status}`);
    }

    const xml = await response.text();
    const papers = parseArxivXml(xml).map(toArxivPaper);

    // Cache the results
    createArxivCache({ query, results: papers });

    return NextResponse.json(papers);
  } catch (error) {
    // On fetch error, return stale cache with status 206 if available
    if (cached) {
      return NextResponse.json(cached.results, {
        status: 206,
        headers: {
          "X-Cached": "stale",
          "X-Cache-Age": String(now - cached.timestamp),
          "X-Error": "Failed to fetch from arXiv API, serving stale cache",
        },
      });
    }

    // On error with no cache, return 500
    console.error("Error fetching from arXiv API:", error);
    return NextResponse.json(
      { error: "Failed to fetch from arXiv API" },
      { status: 500 }
    );
  }
}
