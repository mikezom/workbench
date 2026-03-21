import { readFileSync } from "fs";
import { join } from "path";

describe("CrawlPage", () => {
  const pageContent = readFileSync(join(__dirname, "page.tsx"), "utf-8");

  it("should have 7 panel components defined", () => {
    // Count panel component definitions (6 source panels + 1 placeholder panel)
    // Use capital letter after "function " to exclude helper functions like getInitialPanel
    const panelFunctionMatches = pageContent.match(/function [A-Z]\w+Panel\(\)/g);
    expect(panelFunctionMatches).toBeTruthy();
    expect(panelFunctionMatches!.length).toBe(7);
  });

  it("should render all 7 panels in the grid", () => {
    // Verify the grid contains 7 panel components
    const gridSection = pageContent.match(/<div className="grid[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*\);/);
    expect(gridSection).toBeTruthy();

    // Count panel component usages - should match the current panel set
    const panelUsages = gridSection![1].match(/<\w+Panel\s*\/>/g);
    expect(panelUsages).toBeTruthy();
    expect(panelUsages!.length).toBe(7);
  });

  it("should have panel titles for all 6 sources", () => {
    // Verify panel titles exist in the code
    expect(pageContent).toContain("arXiv");
    expect(pageContent).toContain("JIN10 NEWS");
    expect(pageContent).toContain("SOLIDOT");
    expect(pageContent).toContain("nLab");
    expect(pageContent).toContain("Planet Haskell");
    expect(pageContent).toContain("Reddit");
  });

  it("should have SubNavigation component for portrait mode", () => {
    expect(pageContent).toContain("function SubNavigation");
    expect(pageContent).toContain("sub-nav-glass");
  });

  it("should have activePanel state management", () => {
    expect(pageContent).toContain("activePanel");
    expect(pageContent).toContain("setActivePanel");
    expect(pageContent).toContain("crawl-active-panel");
  });

  it("should have portrait mode visibility classes", () => {
    expect(pageContent).toContain("portrait:block");
    expect(pageContent).toContain("portrait:hidden");
  });
});
