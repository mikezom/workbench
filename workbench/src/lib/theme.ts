export type Theme = "light" | "dark";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return "light";
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;

  localStorage.setItem("theme", theme);

  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function toggleTheme(): Theme {
  const current = getTheme();
  const newTheme: Theme = current === "light" ? "dark" : "light";
  setTheme(newTheme);
  return newTheme;
}

export function initTheme(): void {
  const theme = getTheme();
  setTheme(theme);
}
