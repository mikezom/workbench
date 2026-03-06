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
    const parseErrors = xmlDoc.getElementsByTagName("parsererror");
    if (parseErrors.length > 0) {
      console.error("XML parse error:", parseErrors[0].textContent);
      return [];
    }

    // Extract items
    const items = xmlDoc.getElementsByTagName("item");
    const newsItems: SolidotNewsItem[] = [];

    for (let i = 0; i < Math.min(items.length, 20); i++) {
      const item = items[i];

      const titleEl = item.getElementsByTagName("title")[0];
      const linkEl = item.getElementsByTagName("link")[0];
      const pubDateEl = item.getElementsByTagName("pubDate")[0];
      const descriptionEl = item.getElementsByTagName("description")[0];
      const guidEl = item.getElementsByTagName("guid")[0];

      const title = titleEl?.textContent?.trim();
      const link = linkEl?.textContent?.trim();
      const pubDate = pubDateEl?.textContent?.trim();
      const description = descriptionEl?.textContent?.trim();
      const guid = guidEl?.textContent?.trim();

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
    }

    console.log(`Parsed ${newsItems.length} items from SOLIDOT RSS`);
    return newsItems;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("SOLIDOT RSS fetch timeout");
      throw new Error("RSS fetch timeout");
    } else {
      console.error("Error fetching SOLIDOT RSS:", error);
      throw error; // Re-throw to allow API route to handle
    }
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
