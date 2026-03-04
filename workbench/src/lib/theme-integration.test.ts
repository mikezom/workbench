import { setTheme, initTheme } from "./theme";

describe("theme integration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("should apply dark theme on page load when dark theme was previously set", () => {
    // Simulate user having set dark theme in a previous session
    localStorage.setItem("theme", "dark");

    // Simulate page load - the dark class should NOT be present yet
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // initTheme should be called on page load to apply the stored theme
    initTheme();

    // Now the dark class should be applied
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should prevent flash of wrong theme by applying theme before first render", () => {
    // This test documents the expected behavior:
    // The theme should be applied BEFORE React hydration to prevent FOUC

    // Set dark theme
    localStorage.setItem("theme", "dark");

    // The problem: if initTheme is called in useEffect, there will be a flash
    // because useEffect runs AFTER the first render

    // The solution: initTheme should be called in a blocking script tag
    // in the HTML head, before React loads

    // For now, this test just verifies that initTheme works when called
    initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should maintain theme state across page navigation", () => {
    // Set dark theme
    setTheme("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Simulate navigation (localStorage persists, but DOM might reset)
    document.documentElement.classList.remove("dark");

    // On new page load, initTheme should restore the theme
    initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
