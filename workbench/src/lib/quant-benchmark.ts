const BENCHMARK_ALIASES: Record<string, string> = {
  HS300: "000300.SH",
  "CSI 300": "000300.SH",
  "CSI300": "000300.SH",
  "000300": "000300.SH",
  ZZ500: "000905.SH",
  "CSI 500": "000905.SH",
  "CSI500": "000905.SH",
  "000905": "000905.SH",
  ZZ1000: "000852.SH",
  "CSI 1000": "000852.SH",
  "CSI1000": "000852.SH",
  "000852": "000852.SH",
};

export function normalizeBenchmarkCode(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "000300.SH";

  const upper = trimmed.toUpperCase();
  if (BENCHMARK_ALIASES[upper]) return BENCHMARK_ALIASES[upper];
  if (/^\d{6}\.(SH|SZ)$/.test(upper)) return upper;
  if (/^\d{6}$/.test(upper)) return `${upper}.SH`;
  return upper;
}
