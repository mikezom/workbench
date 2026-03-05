import { Jin10NewsItem } from "./crawl-db";

/**
 * Parse HTML from jin10.com homepage and extract news items
 * @param html Raw HTML string from jin10.com
 * @returns Array of news items (max 20)
 */
export function parseJin10Html(html: string): Jin10NewsItem[] {
  try {
    const items: Jin10NewsItem[] = [];

    // Jin10 uses flash news items with specific class structure
    // Container: jin-flash-item-container with id like "flash20260305232000000800"
    // Time element: <div class="item-time">HH:MM:SS</div>
    // Content element: <div class="flash-text">content</div>
    // Link pattern: https://flash.jin10.com/detail/{id}

    // Match flash item containers with their IDs
    const itemPattern = /<div[^>]*id="(flash\d+)"[^>]*class="[^"]*jin-flash-item-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*id="flash|<\/div>|$)/gi;
    const timePattern = /<div[^>]*class="[^"]*item-time[^"]*"[^>]*>([\d:]+)<\/div>/i;
    const contentPattern = /<div[^>]*class="[^"]*flash-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

    let match;
    let count = 0;

    while ((match = itemPattern.exec(html)) !== null && count < 20) {
      const flashId = match[1]; // e.g., "flash20260305232000000800"
      const itemHtml = match[2];

      const timeMatch = timePattern.exec(itemHtml);
      const contentMatch = contentPattern.exec(itemHtml);

      if (timeMatch && contentMatch) {
        const timestamp = timeMatch[1].trim(); // e.g., "23:20:00"
        const title = stripHtml(contentMatch[1]).trim();

        if (title && timestamp) {
          // Extract the numeric ID from flashId for the detail link
          const numericId = flashId.replace("flash", "");
          const link = `https://flash.jin10.com/detail/${numericId}`;

          items.push({
            id: flashId,
            title,
            timestamp,
            summary: undefined, // Jin10 doesn't have separate summaries
            link,
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
