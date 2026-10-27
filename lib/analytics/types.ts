import type { QuestionType } from "@prisma/client";

/** Kategori kesulitan empiris (bukan `Question.difficulty` yang ditulis guru). */
export type ItemDifficultyCategory = "EASY" | "MEDIUM" | "HARD";

/** Kategori daya pembeda butir soal. */
export type ItemDiscriminationCategory = "GOOD" | "FAIR" | "POOR";

export type AnalyticsWarning =
  | "no_graded_attempts"
  | "sample_too_small"
  | "invalid_scores"
  | "invalid_snapshot"
  | "sample_truncated_at_5000";

export type DistributionBucket = {
  /** Label opsi (A/B/C) atau kunci bucket (`correct`, `skipped`, ...). */
  key: string;
  label: string;
  count: number;
  /** Persentase terhadap seluruh attempt GRADED (0..100, 1 desimal). */
  percentage: number | null;
  isCorrect?: boolean;
};

export type ItemGroupStat = {
  count: number;
  correct: number;
  /** Proporsi benar di dalam group (0..1, 2 desimal). */
  rate: number | null;
};

export type ItemAnalytics = {
  examQuestionId: string;
  order: number;
  type: QuestionType | null;
  typeLabel: string;
  questionText: string;
  questionTextTruncated: boolean;
  points: number;
  /** Diisi bila snapshot rusak; item tetap ditampilkan agar guru bisa menelusuri. */
  integrityError: string | null;
  /** Jumlah attempt GRADED valid (dengan totalScore) yang menjadi denominator. */
  gradedTotal: number;
  answeredCount: number;
  correctCount: number;
  skipCount: number;
  skipRate: number | null;
  pValue: number | null;
  difficultyCategory: ItemDifficultyCategory | null;
  /** null untuk ESSAY, sample < 10, atau snapshot rusak. */
  discrimination: number | null;
  discriminationCategory: ItemDiscriminationCategory | null;
  highGroup: ItemGroupStat | null;
  lowGroup: ItemGroupStat | null;
  distribution: DistributionBucket[];
  /** true untuk MULTIPLE_CHOICE: persentase label bisa berjumlah > 100%. */
  multiSelect: boolean;
};

export type AnalyticsSample = {
  /** Jumlah attempt yang dipakai untuk D-index (setelah cap). */
  size: number;
  /** Jumlah seluruh attempt GRADED valid sebelum cap. */
  totalGraded: number;
  truncated: boolean;
  reliable: boolean;
  warningThreshold: number;
  reliableThreshold: number;
};

export type AnalyticsSummary = {
  gradedAttempts: number;
  pendingAttempts: number;
  inProgressAttempts: number;
  /** GRADED dengan totalScore null (tidak ikut analisis). */
  invalidAttempts: number;
  totalQuestions: number;
  objectiveQuestions: number;
  essayQuestions: number;
  difficultyCounts: Record<ItemDifficultyCategory, number>;
  discriminationCounts: Record<ItemDiscriminationCategory, number>;
  /** Item tanpa D-index: essay, sample kecil, atau snapshot rusak. */
  notApplicableDiscrimination: number;
  sample: AnalyticsSample;
  warnings: AnalyticsWarning[];
};

export type ExamAnalytics = {
  summary: AnalyticsSummary;
  items: ItemAnalytics[];
};

export type AnalyticsFilters = {
  type?: QuestionType;
  difficulty?: ItemDifficultyCategory;
};
