import type {
  AnalyticsWarning,
  ItemDifficultyCategory,
  ItemDiscriminationCategory,
} from "./types";

export const ITEM_DIFFICULTY_LABEL: Record<ItemDifficultyCategory, string> = {
  EASY: "Mudah",
  MEDIUM: "Sedang",
  HARD: "Sulit",
};

export const ITEM_DISCRIMINATION_LABEL: Record<
  ItemDiscriminationCategory,
  string
> = {
  GOOD: "Baik",
  FAIR: "Cukup",
  POOR: "Buruk",
};

export const ANALYTICS_WARNING_MESSAGE: Record<AnalyticsWarning, string> = {
  no_graded_attempts:
    "Belum ada attempt yang sudah dinilai. Analisis butir baru tersedia setelah minimal satu attempt berstatus GRADED.",
  sample_too_small:
    "Sample terlalu kecil (< 10 attempt GRADED). Difficulty index masih informatif, tetapi daya pembeda (D-index) tidak dihitung.",
  invalid_scores:
    "Ada attempt GRADED dengan totalScore tidak valid. Attempt tersebut tidak ikut analisis.",
  invalid_snapshot:
    "Ada soal dengan snapshot rusak. Soal tersebut ditampilkan tanpa metrik; periksa integritas data ujian.",
  sample_truncated_at_5000:
    "Analisis memakai maksimal 5000 attempt teratas. Total attempt lebih besar, sehingga D-index dihitung dari sample yang dipotong.",
};
