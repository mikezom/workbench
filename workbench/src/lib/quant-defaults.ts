function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function getDefaultBacktestDateRange(referenceDate: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - 3);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
}
