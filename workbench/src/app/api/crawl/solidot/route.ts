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
