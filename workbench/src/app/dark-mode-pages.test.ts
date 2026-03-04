import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Tests to verify that all section pages have proper dark mode support.
 * 
 * The theme toggle in the sidebar applies the 'dark' class to the <html> element,
 * and Tailwind's dark mode is configured with darkMode: 'class'.
 * 
 * For dark mode to work globally, all section pages must use dark: variants
 * for their backgrounds, text colors, borders, and other visual elements.
 */

describe("Dark mode support in section pages", () => {
  const pagesDir = join(__dirname);

  it("forest page should have dark mode variants for background and text", () => {
    const forestPagePath = join(pagesDir, "forest", "page.tsx");
    const content = readFileSync(forestPagePath, "utf-8");

    // Forest page currently has hardcoded bg-white with no dark variant
    // It should have dark:bg-gray-900 or similar
    expect(content).toMatch(/dark:bg-/);
    
    // The breadcrumb bar should also have dark variants
    expect(content).toMatch(/dark:border-/);
    expect(content).toMatch(/dark:text-/);
  });

  it("crawl page should have dark mode variants", () => {
    const crawlPagePath = join(pagesDir, "crawl", "page.tsx");
    const content = readFileSync(crawlPagePath, "utf-8");

    // Crawl page uses PageContainer which should have dark mode support
    // Or the page itself should have a wrapper with dark mode classes
    expect(content).toMatch(/dark:/);
  });

  it("PageContainer component should have dark mode variants", () => {
    const pageContainerPath = join(__dirname, "..", "components", "page-container.tsx");
    const content = readFileSync(pageContainerPath, "utf-8");

    // PageContainer should have background and text color with dark variants
    expect(content).toMatch(/bg-white.*dark:bg-/);
    expect(content).toMatch(/text-.*dark:text-/);
  });

  it("study page should have dark mode variants for main container", () => {
    const studyPagePath = join(pagesDir, "study", "page.tsx");
    const content = readFileSync(studyPagePath, "utf-8");

    // Study page has a complex layout with sidebars and main panel
    // The main container should have dark mode background
    expect(content).toMatch(/bg-white.*dark:bg-gray-900/);
  });

  it("agent page should have dark mode variants for main container", () => {
    const agentPagePath = join(pagesDir, "agent", "page.tsx");
    const content = readFileSync(agentPagePath, "utf-8");

    // Agent page has task board and modals
    // The main container should have dark mode background
    expect(content).toMatch(/bg-white.*dark:bg-gray-900/);
  });

  it("home page should maintain its existing dark mode support", () => {
    const homePagePath = join(pagesDir, "page.tsx");
    const content = readFileSync(homePagePath, "utf-8");

    // Home page already has dark mode support - verify it's still there
    expect(content).toMatch(/dark:bg-neutral-800/);
    expect(content).toMatch(/dark:text-neutral-200/);
  });
});
