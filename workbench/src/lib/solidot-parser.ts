import { DOMParser } from "@xmldom/xmldom";
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
