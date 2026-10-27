import type { QuestionType } from "@prisma/client";

import type {
  AnalyticsFilters,
  AnalyticsWarning,
  DistributionBucket,
  ItemAnalytics,
  ItemDifficultyCategory,
  ItemDiscriminationCategory,
} from "./types";

/** Ambang minimal untuk menghitung D-index. Di bawah ini D = null. */
export const DISCRIMINATION_MIN_SAMPLE = 10;

/** Proporsi kelompok atas/bawah menurut metode 27% (Crocker & Algina). */
export const EXTREME_GROUP_RATIO = 0.27;

/** Hard warning sample kecil. */
export const SAMPLE_WARNING_THRESHOLD = 10;

/** Batas sample agar analisis tetap reliable untuk interpretasi guru. */
export const SAMPLE_RELIABLE_THRESHOLD = 30;

/** Safety cap attempt yang diproses untuk ranking & D-index. */
export const ANALYTICS_MAX_ATTEMPTS = 5000;

export function roundMetric(value: number, digits = 2): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * p-value = jumlah benar / jumlah attempt GRADED.
 * Mengembalikan null bila denominator tidak valid.
 */
export function computeDifficultyIndex(
  correctCount: number,
  gradedTotal: number,
): number | null {
  if (
    !Number.isFinite(correctCount) ||
    !Number.isFinite(gradedTotal) ||
    gradedTotal <= 0
  ) {
    return null;
  }

  return clamp(correctCount / gradedTotal, 0, 1);
}

/** Batas atas inklusif: p = 0.70 tetap "sedang". */
export function classifyDifficulty(
  pValue: number | null,
): ItemDifficultyCategory | null {
  if (pValue === null) {
    return null;
  }

  if (pValue > 0.7) {
    return "EASY";
  }

  if (pValue >= 0.3) {
    return "MEDIUM";
  }

  return "HARD";
}

/**
 * Ukuran kelompok ekstrem 27%. `floor` dipakai agar porsi tidak pernah
 * melebihi 27% dan hasilnya deterministik (n=10 → 2).
 *
 * Sample < 10 mengembalikan null: satu attempt yang mewakili 100% group
 * terlalu menyesatkan untuk dilaporkan sebagai D-index.
 */
export function extremeGroupSize(total: number): number | null {
  if (!Number.isInteger(total) || total < DISCRIMINATION_MIN_SAMPLE) {
    return null;
  }

  const size = Math.max(1, Math.floor(total * EXTREME_GROUP_RATIO));

  return Math.min(size, Math.floor(total / 2));
}

export function pickExtremeGroups<T extends { id: string }>(
  ranked: readonly T[],
): { size: number; high: T[]; low: T[] } | null {
  const size = extremeGroupSize(ranked.length);

  if (size === null) {
    return null;
  }

  return {
    size,
    high: ranked.slice(0, size),
    low: ranked.slice(ranked.length - size),
  };
}

/**
 * D = p_high - p_low. Nilai mentah (belum dibulatkan) supaya klasifikasi
 * memakai presisi penuh.
 */
export function computeDiscrimination(
  highCorrect: number,
  highTotal: number,
  lowCorrect: number,
  lowTotal: number,
): number | null {
  if (
    !Number.isFinite(highCorrect) ||
    !Number.isFinite(lowCorrect) ||
    highTotal <= 0 ||
    lowTotal <= 0
  ) {
    return null;
  }

  return highCorrect / highTotal - lowCorrect / lowTotal;
}

/** Batas bawah inklusif: D = 0.30 "cukup", D = 0.10 "cukup". */
export function classifyDiscrimination(
  discrimination: number | null,
): ItemDiscriminationCategory | null {
  if (discrimination === null) {
    return null;
  }

  if (discrimination > 0.3) {
    return "GOOD";
  }

  if (discrimination >= 0.1) {
    return "FAIR";
  }

  return "POOR";
}

export function computeSkipRate(
  skipCount: number,
  gradedTotal: number,
): number | null {
  if (
    !Number.isFinite(skipCount) ||
    !Number.isFinite(gradedTotal) ||
    gradedTotal <= 0
  ) {
    return null;
  }

  return clamp(skipCount / gradedTotal, 0, 1);
}

export function shouldTruncate(
  total: number,
  limit = ANALYTICS_MAX_ATTEMPTS,
): boolean {
  return total > limit;
}

export function buildSampleWarnings(input: {
  gradedTotal: number;
  invalidAttempts: number;
  invalidSnapshots: number;
  truncated: boolean;
}): AnalyticsWarning[] {
  const warnings: AnalyticsWarning[] = [];

  if (input.gradedTotal === 0) {
    warnings.push("no_graded_attempts");
  } else if (input.gradedTotal < SAMPLE_WARNING_THRESHOLD) {
    warnings.push("sample_too_small");
  }

  if (input.invalidAttempts > 0) {
    warnings.push("invalid_scores");
  }

  if (input.invalidSnapshots > 0) {
    warnings.push("invalid_snapshot");
  }

  if (input.truncated) {
    warnings.push("sample_truncated_at_5000");
  }

  return warnings;
}

const CHOICE_TYPES: readonly QuestionType[] = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
];

function percentageOf(count: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }

  return roundMetric((count / total) * 100, 1);
}

function bucket(
  key: string,
  label: string,
  count: number,
  gradedTotal: number,
  isCorrect?: boolean,
): DistributionBucket {
  return {
    key,
    label,
    count,
    percentage: percentageOf(count, gradedTotal),
    ...(isCorrect === undefined ? {} : { isCorrect }),
  };
}

export type DistributionOption = {
  label: string;
  text: string;
  isCorrect: boolean;
};

/**
 * Distribusi jawaban. Untuk soal pilihan, setiap label di-zero-fill dari
 * snapshot dan label tak dikenal tetap ditampilkan. Persentase memakai
 * denominator seluruh attempt GRADED, sehingga pada multi-select totalnya
 * bisa melebihi 100%.
 */
export function buildDistribution(input: {
  type: QuestionType;
  options: readonly DistributionOption[];
  labelCounts: ReadonlyMap<string, number>;
  gradedTotal: number;
  answeredCount: number;
  correctCount: number;
}): DistributionBucket[] {
  const { type, options, labelCounts, gradedTotal } = input;

  if (CHOICE_TYPES.includes(type)) {
    const known = new Set<string>();
    const buckets = options.map((option) => {
      known.add(option.label);

      return bucket(
        option.label,
        option.text,
        labelCounts.get(option.label) ?? 0,
        gradedTotal,
        option.isCorrect,
      );
    });

    for (const [label, count] of labelCounts) {
      if (!known.has(label)) {
        buckets.push(
          bucket(label, `Label ${label} (tidak dikenal)`, count, gradedTotal),
        );
      }
    }

    return buckets;
  }

  const answeredCount = Math.max(0, input.answeredCount);
  const correctCount = clamp(input.correctCount, 0, answeredCount);
  const skipped = Math.max(0, gradedTotal - answeredCount);

  if (type === "SHORT_ANSWER") {
    return [
      bucket("correct", "Benar", correctCount, gradedTotal, true),
      bucket(
        "incorrect",
        "Salah / varian jawaban",
        answeredCount - correctCount,
        gradedTotal,
        false,
      ),
      bucket("skipped", "Tidak dijawab", skipped, gradedTotal),
    ];
  }

  // ESSAY: correctCount dihitung dari score > 0.
  return [
    bucket("scored", "Skor > 0", correctCount, gradedTotal, true),
    bucket("zero", "Skor 0", answeredCount - correctCount, gradedTotal, false),
    bucket("skipped", "Tidak dijawab", skipped, gradedTotal),
  ];
}

/** Filter presentasi; summary tetap dihitung dari seluruh soal. */
export function filterAnalyticsItems(
  items: readonly ItemAnalytics[],
  filters: AnalyticsFilters,
): ItemAnalytics[] {
  return items.filter((item) => {
    if (filters.type && item.type !== filters.type) {
      return false;
    }

    if (filters.difficulty && item.difficultyCategory !== filters.difficulty) {
      return false;
    }

    return true;
  });
}
