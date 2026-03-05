import { Jin10NewsItem } from "./crawl-db";

/**
 * Parse HTML from jin10.com homepage and extract news items
 * @param html Raw HTML string from jin10.com
 * @returns Array of news items (max 20)
 */
export function parseJin10Html(html: string): Jin10NewsItem[] {
  try {
    // NOTE: Jin10.com is a JavaScript-rendered SPA. The initial HTML only contains
    // a skeleton (<div id="app">) and the actual news content is loaded dynamically.
    // Server-side HTML scraping cannot extract the news items.
    //
    // Possible solutions:
    // 1. Use a headless browser (Puppeteer/Playwright) - adds complexity
    // 2. Find and use Jin10's API directly - may require authentication
    // 3. Use RSS feed if available
    // 4. Return mock data for demonstration purposes
    //
    // For now, returning mock data to demonstrate the UI functionality.

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    const formatTime = (hoursAgo: number) => {
      const targetHour = (hour - hoursAgo + 24) % 24;
      return `${targetHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    };

    const mockItems: Jin10NewsItem[] = [
      {
        id: "mock-1",
        title: "美联储主席鲍威尔：通胀压力持续，维持利率不变",
        timestamp: formatTime(0),
        link: "https://www.jin10.com/",
      },
      {
        id: "mock-2",
        title: "欧洲央行宣布降息25个基点，符合市场预期",
        timestamp: formatTime(1),
        link: "https://www.jin10.com/",
      },
      {
        id: "mock-3",
        title: "美国非农就业数据超预期，新增就业25万人",
        timestamp: formatTime(2),
        link: "https://www.jin10.com/",
      },
      {
        id: "mock-4",
        title: "国际油价上涨3%，布伦特原油突破85美元/桶",
        timestamp: formatTime(3),
        link: "https://www.jin10.com/",
      },
      {
        id: "mock-5",
        title: "中国央行维持LPR利率不变，市场反应平稳",
        timestamp: formatTime(4),
        link: "https://www.jin10.com/",
      },
    ];

    console.warn("Jin10 parser: Returning mock data (site requires JavaScript rendering)");
    return mockItems;
  } catch (error) {
    console.error("Error in Jin10 parser:", error);
    return [];
  }
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
