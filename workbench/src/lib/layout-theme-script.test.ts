import { readFileSync } from "fs";
import { join } from "path";

describe("layout.tsx theme initialization", () => {
  it("should include a blocking script tag in the HTML head to prevent FOUC", () => {
    // Read the layout.tsx file
    const layoutPath = join(__dirname, "../app/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    // The layout should include a <script> tag that:
    // 1. Reads theme from localStorage
    // 2. Applies dark class to document.documentElement
    // 3. Runs before React hydration (blocking, in <head>)

    // Check for the presence of a script tag
    expect(layoutContent).toContain("<script");

    // Check that it reads from localStorage
    expect(layoutContent).toContain("localStorage.getItem");

    // Check that it applies the dark class
    expect(layoutContent).toContain("classList.add");
    expect(layoutContent).toContain("dark");
  });

  it("should apply theme in <head> section, not in <body>", () => {
    const layoutPath = join(__dirname, "../app/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    // Find the <head> section
    const headMatch = layoutContent.match(/<head[^>]*>([\s\S]*?)<\/head>/);
    expect(headMatch).toBeTruthy();

    if (headMatch) {
      const headContent = headMatch[1];

      // The script should be in the <head> section
      expect(headContent).toContain("script");
      expect(headContent).toContain("localStorage");
    }
  });
});
