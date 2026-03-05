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
