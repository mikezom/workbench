import { formatDate } from "./date-utils";

describe("formatDate", () => {
  it("formats a date as YYYY-MM-DD", () => {
    const date = new Date(2024, 2, 15); // March 15, 2024 (month is 0-indexed)
    expect(formatDate(date)).toBe("2024-03-15");
  });

  it("zero-pads single-digit months", () => {
    const date = new Date(2024, 0, 15); // January 15, 2024
    expect(formatDate(date)).toBe("2024-01-15");
  });

  it("zero-pads single-digit days", () => {
    const date = new Date(2024, 2, 5); // March 5, 2024
    expect(formatDate(date)).toBe("2024-03-05");
  });

  it("handles year boundaries correctly", () => {
    const date = new Date(2023, 11, 31); // December 31, 2023
    expect(formatDate(date)).toBe("2023-12-31");
  });

  it("handles leap year dates", () => {
    const date = new Date(2024, 1, 29); // February 29, 2024 (leap year)
    expect(formatDate(date)).toBe("2024-02-29");
  });
});
