import { getTheme, setTheme, toggleTheme, initTheme } from "./theme";

describe("theme utilities", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Remove dark class from document
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  });

  describe("getTheme", () => {
    it("returns 'light' when no theme is stored", () => {
      expect(getTheme()).toBe("light");
    });

    it("returns stored theme from localStorage", () => {
      localStorage.setItem("theme", "dark");
      expect(getTheme()).toBe("dark");
    });

    it("returns 'light' for invalid stored values", () => {
      localStorage.setItem("theme", "invalid");
      expect(getTheme()).toBe("light");
    });
  });

  describe("setTheme", () => {
    it("stores theme in localStorage", () => {
      setTheme("dark");
      expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("adds dark class to document element when theme is dark", () => {
      setTheme("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("removes dark class from document element when theme is light", () => {
      document.documentElement.classList.add("dark");
      setTheme("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("toggleTheme", () => {
    it("switches from light to dark", () => {
      localStorage.setItem("theme", "light");
      const newTheme = toggleTheme();
      expect(newTheme).toBe("dark");
      expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("switches from dark to light", () => {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
      const newTheme = toggleTheme();
      expect(newTheme).toBe("light");
      expect(localStorage.getItem("theme")).toBe("light");
    });

    it("defaults to dark when no theme is set", () => {
      const newTheme = toggleTheme();
      expect(newTheme).toBe("dark");
    });
  });

  describe("initTheme", () => {
    it("applies stored theme on initialization", () => {
      localStorage.setItem("theme", "dark");
      initTheme();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("applies light theme when no theme is stored", () => {
      initTheme();
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});
