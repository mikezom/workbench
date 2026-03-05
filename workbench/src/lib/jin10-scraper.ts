import puppeteer from "puppeteer";
import { Jin10NewsItem } from "./crawl-db";

/**
 * Scrape Jin10 news using Puppeteer (headless browser)
 * @returns Array of news items
 */
export async function scrapeJin10News(): Promise<Jin10NewsItem[]> {
  let browser;
  try {
    console.log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set user agent to avoid detection
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("Navigating to jin10.com...");
    await page.goto("https://www.jin10.com/", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    console.log("Waiting for content to load...");
    // Wait for flash news items to appear
    await page.waitForSelector(".flash-text", { timeout: 10000 });

    console.log("Extracting news items...");
    // Extract news items from the page
    const items = await page.evaluate(() => {
      const newsItems: Array<{
        id: string;
        title: string;
        timestamp: string;
        link?: string;
      }> = [];

      // Find all flash news items
      const flashItems = document.querySelectorAll('[id^="flash"]');

      flashItems.forEach((item, index) => {
        if (index >= 20) return; // Limit to 20 items

        const id = item.id;
        const timeElement = item.querySelector(".item-time");
        const textElement = item.querySelector(".flash-text");

        if (timeElement && textElement) {
          const timestamp = timeElement.textContent?.trim() || "";
          const title = textElement.textContent?.trim() || "";

          if (title && timestamp) {
            // Extract numeric ID for detail link
            const numericId = id.replace("flash", "");
            const link = `https://flash.jin10.com/detail/${numericId}`;

            newsItems.push({
              id,
              title,
              timestamp,
              link,
            });
          }
        }
      });

      return newsItems;
    });

    console.log(`Extracted ${items.length} news items`);

    // Convert to Jin10NewsItem format
    const result: Jin10NewsItem[] = items.map((item) => ({
      id: item.id,
      title: item.title,
      timestamp: item.timestamp,
      summary: undefined,
      link: item.link,
    }));

    return result;
  } catch (error) {
    console.error("Error scraping Jin10 with Puppeteer:", error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}
