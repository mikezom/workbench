import { readFileSync } from "fs";
import { join } from "path";

describe("CrawlPage", () => {
  const pageContent = readFileSync(join(__dirname, "page.tsx"), "utf-8");

  it("should have 6 panel components defined", () => {
    // Count panel function definitions (ArxivPanel + 5 new panels)
    const panelFunctionMatches = pageContent.match(/function \w+Panel\(\)/g);
    expect(panelFunctionMatches).toBeTruthy();
    expect(panelFunctionMatches!.length).toBe(6);
  });

  it("should render all 6 panels in the grid", () => {
    // Verify the grid contains 6 panel components
    const gridSection = pageContent.match(/<div className="grid[^>]*>([\s\S]*?)<\/div>/);
    expect(gridSection).toBeTruthy();

    // Count panel component usages (e.g., <ArxivPanel />, <Jin10Panel />, etc.)
    const panelUsages = gridSection![1].match(/<\w+Panel\s*\/>/g);
    expect(panelUsages).toBeTruthy();
    expect(panelUsages!.length).toBe(6);
  });

  it("should have panel titles for all 6 sources", () => {
    // Verify panel titles exist in the code
    expect(pageContent).toContain("arXiv");
    expect(pageContent).toContain("JIN10 NEWS");
    expect(pageContent).toContain("Lobsters");
    expect(pageContent).toContain("nLab");
    expect(pageContent).toContain("Planet Haskell");
    expect(pageContent).toContain("Reddit");
  });
});
