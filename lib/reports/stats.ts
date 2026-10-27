import type { HistogramBin } from "./types";

/**
 * Lima bin 20% dengan **batas atas inklusif**:
 * - 0% dan 20% → bin 1
 * - 40% → bin 2, 50% → bin 3, 80% → bin 4, 100% → bin 5
 *
 * `floor(pct / 20)` sengaja tidak dipakai: nilai tepat di batas (20/40/60/80)
 * akan jatuh ke bin berikutnya dan membuat bin pertama kosong untuk 20%.
 */
export const HISTOGRAM_BIN_DEFINITIONS = [
  { bin: 1, label: "0–20%", min: 0, max: 20 },
  { bin: 2, label: "21–40%", min: 21, max: 40 },
  { bin: 3, label: "41–60%", min: 41, max: 60 },
  { bin: 4, label: "61–80%", min: 61, max: 80 },
  { bin: 5, label: "81–100%", min: 81, max: 100 },
] as const;

/** Batas atas eksklusif internal (0–20, >20–40, ... >80–100). */
const UPPER_BOUNDS = [20, 40, 60, 80, 100] as const;

/**
 * Persentase (0..100) → nomor bin 1..5. `ceil(pct / 20) - 1` dengan clamp
 * menghasilkan batas atas inklusif. Nilai di luar 0..100 di-clamp.
 */
export function percentageBin(percentage: number): number {
  if (!Number.isFinite(percentage)) {
    return 1;
  }

  const clamped = Math.min(100, Math.max(0, percentage));
  const index = Math.min(
    UPPER_BOUNDS.length - 1,
    Math.max(0, Math.ceil(clamped / 20) - 1),
  );

  return index + 1;
}

/**
 * Persentase satu attempt terhadap `maxScore` miliknya sendiri.
 * Mengembalikan null bila belum dinilai atau `maxScore` tidak valid.
 */
export function attemptPercentage(
  totalScore: number | null,
  maxScore: number | null,
): number | null {
  if (totalScore === null || maxScore === null || maxScore <= 0) {
    return null;
  }

  return Math.round((totalScore / maxScore) * 1_000) / 10;
}

export function emptyHistogram(): HistogramBin[] {
  return HISTOGRAM_BIN_DEFINITIONS.map((definition) => ({
    ...definition,
    count: 0,
  }));
}

/** Bangun 5 bin lengkap dari pasangan `{ bin, count }` hasil agregasi. */
export function buildHistogram(
  rows: readonly { bin: number; count: number }[],
): HistogramBin[] {
  const histogram = emptyHistogram();

  for (const row of rows) {
    const target = histogram.find((entry) => entry.bin === row.bin);

    if (target) {
      target.count += row.count;
    }
  }

  return histogram;
}

export function histogramTotal(histogram: readonly HistogramBin[]): number {
  return histogram.reduce((total, entry) => total + entry.count, 0);
}

/** Bulatkan ke 1 desimal supaya angka statistik stabil di UI dan export. */
export function roundScore(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10) / 10;
}

export function roundPercentage(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10) / 10;
}
