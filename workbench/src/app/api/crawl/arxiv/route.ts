import { NextRequest, NextResponse } from "next/server";
import { getArxivCache, createArxivCache } from "@/lib/crawl-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ARXIV_API_URL = "http://export.arxiv.org/api/query";
const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArxivPaper {
  id: string;
  published: string;
  title: string;
  summary: string;
  authors: string[];
  link: string;
}

// ---------------------------------------------------------------------------
// XML Parser
// ---------------------------------------------------------------------------

/**
 * Parse arXiv XML response using regex.
 * Extracts id, published, title, summary, authors, and link for each paper.
 */
function parseArxivXml(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Split XML into individual entries
  const entryRegex = /<entry[^>]*>[\s\S]*?<\/entry>/g;
  const entries = xml.match(entryRegex) || [];

  for (const entry of entries) {
    const idMatch = entry.match(/<id>([^<]+)<\/id>/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const titleMatch = entry.match(/<title>([^<]*)<\/title>/);
    const summaryMatch = entry.match(/<summary>([^<]*)<\/summary>/);
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/>/);

    // Extract authors
    const authorRegex = /<name>([^<]+)<\/name>/g;
    const authors: string[] = [];
    let authorMatch;
    while ((authorMatch = authorRegex.exec(entry)) !== null) {
      authors.push(authorMatch[1]);
    }

    if (idMatch && titleMatch) {
      papers.push({
        id: idMatch[1].split("/").pop() || idMatch[1],
        published: publishedMatch?.[1] || "",
        title: titleMatch[1].trim(),
        summary: summaryMatch?.[1].trim() || "",
        authors,
        link: linkMatch?.[1] || "",
      });
    }
  }

  return papers;
}

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

    const url = `${ARXIV_API_URL}?search_query=${encodeURIComponent(query)}`;
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
