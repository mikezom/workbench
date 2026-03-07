import { readFileSync } from "fs";
import { join } from "path";

describe("CrawlPage", () => {
  const pageContent = readFileSync(join(__dirname, "page.tsx"), "utf-8");

  it("should have 6 panel components defined", () => {
    // Count panel component definitions (ArxivPanel + 5 new panels)
    // Use capital letter after "function " to exclude helper functions like getInitialPanel
    const panelFunctionMatches = pageContent.match(/function [A-Z]\w+Panel\(\)/g);
    expect(panelFunctionMatches).toBeTruthy();
    expect(panelFunctionMatches!.length).toBe(6);
  });

  it("should render all 6 panels in the grid", () => {
    // Verify the grid contains 6 panel components (3 functional + 3 stubs)
    const gridSection = pageContent.match(/<div className="grid[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*\);/);
    expect(gridSection).toBeTruthy();

    // Count panel component usages - should still have 6 panels
    // (3 functional panels wrapped in divs + 3 stub panels wrapped in divs)
    const panelUsages = gridSection![1].match(/<\w+Panel\s*\/>/g);
    expect(panelUsages).toBeTruthy();
    expect(panelUsages!.length).toBe(6);
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
