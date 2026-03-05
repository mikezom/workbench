import { Jin10NewsItem } from "./crawl-db";

/**
 * Parse HTML from jin10.com homepage and extract news items
 * @param html Raw HTML string from jin10.com
 * @returns Array of news items (max 20)
 */
export function parseJin10Html(html: string): Jin10NewsItem[] {
  try {
    const items: Jin10NewsItem[] = [];

    // Jin10 uses a news list structure - we'll extract items using regex
    // Pattern: look for news items in the HTML structure
    // This is a simplified parser - adjust based on actual HTML structure

    // Match news item blocks (adjust regex based on actual HTML)
    const itemPattern = /<div[^>]*class="[^"]*news-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const titlePattern = /<[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const timePattern = /<[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const summaryPattern = /<[^>]*class="[^"]*summary[^"]*"[^>]*>(.*?)<\/[^>]*>/i;
    const linkPattern = /href="([^"]*)"/i;

    let match;
    let count = 0;

    while ((match = itemPattern.exec(html)) !== null && count < 20) {
      const itemHtml = match[1];

      const titleMatch = titlePattern.exec(itemHtml);
      const timeMatch = timePattern.exec(itemHtml);

      if (titleMatch && timeMatch) {
        const title = stripHtml(titleMatch[1]).trim();
        const timestamp = stripHtml(timeMatch[1]).trim();

        if (title && timestamp) {
          const summaryMatch = summaryPattern.exec(itemHtml);
          const linkMatch = linkPattern.exec(itemHtml);

          items.push({
            id: crypto.randomUUID(),
            title,
            timestamp,
            summary: summaryMatch ? stripHtml(summaryMatch[1]).trim() : undefined,
            link: linkMatch ? linkMatch[1] : undefined,
          });

          count++;
        }
      }
    }

    return items;
  } catch (error) {
    console.error("Error parsing Jin10 HTML:", error);
    return [];
  }
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
