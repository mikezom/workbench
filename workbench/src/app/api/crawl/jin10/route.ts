import { NextResponse } from "next/server";
import { getJin10Cache, createJin10Cache } from "@/lib/crawl-db";
import { scrapeJin10News } from "@/lib/jin10-scraper";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SCRAPE_TIMEOUT_MS = 30 * 1000; // 30 seconds for Puppeteer

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const now = Date.now();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  // Check cache first (skip if manual refresh)
  const cached = getJin10Cache();
  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    // Return fresh cache
    return NextResponse.json(cached.results, {
      headers: {
        "X-Cached": "true",
        "X-Cache-Age": String(now - cached.timestamp),
      },
    });
  }

  // Scrape from Jin10 using Puppeteer
  try {
    console.log("Starting Jin10 scrape with Puppeteer...");

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Scrape timeout")), SCRAPE_TIMEOUT_MS);
    });

    // Race between scraping and timeout
    const news = await Promise.race([
      scrapeJin10News(),
      timeoutPromise,
    ]);

    console.log(`Scraped ${news.length} items from Jin10`);

    // Cache the results
    try {
      createJin10Cache({ results: news });
    } catch (cacheError) {
      console.error("Failed to cache Jin10 results:", cacheError);
      // Continue anyway - return results to user
    }

    return NextResponse.json(news);
  } catch (error) {
    // On scrape error, return stale cache with status 206 if available
    if (cached) {
      console.log("Scrape failed, returning stale cache");
      return NextResponse.json(cached.results, {
        status: 206,
        headers: {
          "X-Cached": "stale",
          "X-Cache-Age": String(now - cached.timestamp),
          "X-Error": "Failed to scrape from Jin10, serving stale cache",
        },
      });
    }

    // On error with no cache, return 500
    console.error("Error scraping from Jin10:", error);
    return NextResponse.json(
      { error: "Failed to scrape from Jin10" },
      { status: 500 }
    );
  }
}
