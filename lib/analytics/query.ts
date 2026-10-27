import type { QuestionType } from "@prisma/client";

import { parseExamSnapshot } from "@/lib/exams/snapshot";
import { QUESTION_TYPE_LABEL } from "@/lib/questions/labels";
import { prisma } from "@/lib/prisma";

import {
  ANALYTICS_MAX_ATTEMPTS,
  buildDistribution,
  buildSampleWarnings,
  classifyDifficulty,
  classifyDiscrimination,
  computeDifficultyIndex,
  computeDiscrimination,
  computeSkipRate,
  pickExtremeGroups,
  roundMetric,
  SAMPLE_RELIABLE_THRESHOLD,
  SAMPLE_WARNING_THRESHOLD,
  shouldTruncate,
} from "./stats";
import type {
  AnalyticsSummary,
  ExamAnalytics,
  ItemAnalytics,
  ItemDiscriminationCategory,
  ItemDifficultyCategory,
} from "./types";

/** Teks soal di API analytics cukup untuk tabel; tidak perlu 20k karakter. */
export const QUESTION_TEXT_PREVIEW_LENGTH = 500;

type RankedAttemptRow = {
  id: string;
  objectiveScore: number;
};

type ItemAggregateRow = {
  examQuestionId: string;
  answeredCount: number;
  correctCount: number;
};

type LabelDistributionRow = {
  examQuestionId: string;
  label: string;
  count: number;
};

type DiscriminationAnswerRow = {
  attemptId: string;
  examQuestionId: string;
  isCorrect: boolean | null;
};

const EMPTY_DIFFICULTY_COUNTS: Record<ItemDifficultyCategory, number> = {
  EASY: 0,
  MEDIUM: 0,
  HARD: 0,
};

const EMPTY_DISCRIMINATION_COUNTS: Record<ItemDiscriminationCategory, number> =
  {
    GOOD: 0,
    FAIR: 0,
    POOR: 0,
  };

function toMap<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]));
}

/**
 * Ranking memakai **objectiveScore** (sum score soal non-ESSAY), bukan
 * `totalScore`, agar penilaian esai yang subjektif tidak menggeser kelompok
 * atas/bawah untuk soal objektif.
 */
async function listRankedAttempts(examId: string) {
  return prisma.$queryRaw<RankedAttemptRow[]>`
    SELECT at."id" AS "id",
           COALESCE(SUM(a."score") FILTER (
             WHERE eq."snapshotJson"->>'type' IS DISTINCT FROM 'ESSAY'
           ), 0)::int AS "objectiveScore"
    FROM "attempts" at
    LEFT JOIN "answers" a ON a."attemptId" = at."id"
    LEFT JOIN "exam_questions" eq
      ON eq."id" = a."examQuestionId" AND eq."examId" = at."examId"
    WHERE at."examId" = ${examId}
      AND at."status" = 'GRADED'
      AND at."totalScore" IS NOT NULL
    GROUP BY at."id"
    ORDER BY "objectiveScore" DESC, at."id" ASC
    LIMIT ${ANALYTICS_MAX_ATTEMPTS}
  `;
}

async function aggregateItemAnswers(examId: string) {
  return prisma.$queryRaw<ItemAggregateRow[]>`
    SELECT a."examQuestionId" AS "examQuestionId",
           COUNT(*) FILTER (
             WHERE (eq."snapshotJson"->>'type' IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE')
                    AND cardinality(a."selectedLabels") > 0)
                OR (eq."snapshotJson"->>'type' IN ('SHORT_ANSWER', 'ESSAY')
                    AND NULLIF(btrim(a."textAnswer"), '') IS NOT NULL)
           )::int AS "answeredCount",
           COUNT(*) FILTER (
             WHERE (eq."snapshotJson"->>'type' = 'ESSAY'
                    AND NULLIF(btrim(a."textAnswer"), '') IS NOT NULL
                    AND a."score" > 0)
                OR (eq."snapshotJson"->>'type' IS DISTINCT FROM 'ESSAY'
                    AND a."isCorrect" IS TRUE)
           )::int AS "correctCount"
    FROM "answers" a
    JOIN "attempts" at ON at."id" = a."attemptId"
    JOIN "exam_questions" eq ON eq."id" = a."examQuestionId"
    WHERE at."examId" = ${examId}
      AND at."status" = 'GRADED'
      AND at."totalScore" IS NOT NULL
    GROUP BY a."examQuestionId"
  `;
}

async function aggregateLabelDistribution(examId: string) {
  return prisma.$queryRaw<LabelDistributionRow[]>`
    SELECT a."examQuestionId" AS "examQuestionId",
           label AS "label",
           COUNT(*)::int AS "count"
    FROM "answers" a
    JOIN "attempts" at ON at."id" = a."attemptId"
    CROSS JOIN LATERAL unnest(a."selectedLabels") AS label
    WHERE at."examId" = ${examId}
      AND at."status" = 'GRADED'
      AND at."totalScore" IS NOT NULL
    GROUP BY a."examQuestionId", label
  `;
}

async function countAttemptsByStatus(examId: string) {
  const groups = await prisma.attempt.groupBy({
    by: ["status"],
    where: { examId },
    _count: { _all: true },
  });

  const countFor = (status: "IN_PROGRESS" | "SUBMITTED" | "GRADED") =>
    groups.find((group) => group.status === status)?._count._all ?? 0;

  return {
    inProgress: countFor("IN_PROGRESS"),
    submitted: countFor("SUBMITTED"),
    graded: countFor("GRADED"),
  };
}

function parseSnapshotOrNull(snapshotJson: unknown): {
  snapshot: ReturnType<typeof parseExamSnapshot> | null;
  error: string | null;
} {
  try {
    return { snapshot: parseExamSnapshot(snapshotJson), error: null };
  } catch (error) {
    return {
      snapshot: null,
      error:
        error instanceof Error
          ? `Snapshot tidak valid: ${error.message}`
          : "Snapshot tidak valid",
    };
  }
}

function emptyItem(input: {
  examQuestionId: string;
  order: number;
  integrityError: string;
  gradedTotal: number;
}): ItemAnalytics {
  return {
    examQuestionId: input.examQuestionId,
    order: input.order,
    type: null,
    typeLabel: "Tidak diketahui",
    questionText: "(snapshot soal rusak)",
    questionTextTruncated: false,
    points: 0,
    integrityError: input.integrityError,
    gradedTotal: input.gradedTotal,
    answeredCount: 0,
    correctCount: 0,
    skipCount: input.gradedTotal,
    skipRate: input.gradedTotal > 0 ? 1 : null,
    pValue: null,
    difficultyCategory: null,
    discrimination: null,
    discriminationCategory: null,
    highGroup: null,
    lowGroup: null,
    distribution: [],
    multiSelect: false,
  };
}

function toQuestionType(value: unknown): QuestionType | null {
  return typeof value === "string" && value in QUESTION_TYPE_LABEL
    ? (value as QuestionType)
    : null;
}

/**
 * Analisis butir per exam.
 *
 * - p-value & distribusi memakai seluruh attempt GRADED valid (agregasi SQL).
 * - D-index memakai kelompok ekstrem 27% dari ranking `objectiveScore`
 *   (maksimal `ANALYTICS_MAX_ATTEMPTS`). Sample < 10 → D = null.
 * - ESSAY tidak dihitung D-index, tetapi tetap muncul di distribusi.
 */
export async function getExamAnalytics(examId: string): Promise<ExamAnalytics> {
  const [questions, rankedAttempts, aggregates, labelRows, statusCounts, totalGraded] =
    await Promise.all([
      prisma.examQuestion.findMany({
        where: { examId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          pointsOverride: true,
          snapshotJson: true,
        },
      }),
      listRankedAttempts(examId),
      aggregateItemAnswers(examId),
      aggregateLabelDistribution(examId),
      countAttemptsByStatus(examId),
      prisma.attempt.count({
        where: {
          examId,
          status: "GRADED",
          totalScore: { not: null },
        },
      }),
    ]);

  const truncated = shouldTruncate(totalGraded);
  const groups = pickExtremeGroups(rankedAttempts);

  const highIds = new Set(groups?.high.map((attempt) => attempt.id) ?? []);
  const lowIds = new Set(groups?.low.map((attempt) => attempt.id) ?? []);
  const extremeIds = [...highIds, ...lowIds];

  const discriminationRows: DiscriminationAnswerRow[] =
    groups && extremeIds.length > 0
      ? await prisma.answer.findMany({
          where: { attemptId: { in: extremeIds } },
          select: {
            attemptId: true,
            examQuestionId: true,
            isCorrect: true,
          },
        })
      : [];

  const discriminationByQuestion = new Map<
    string,
    { high: number; low: number }
  >();

  for (const row of discriminationRows) {
    if (row.isCorrect !== true) {
      continue;
    }

    const entry = discriminationByQuestion.get(row.examQuestionId) ?? {
      high: 0,
      low: 0,
    };

    if (highIds.has(row.attemptId)) {
      entry.high += 1;
    } else if (lowIds.has(row.attemptId)) {
      entry.low += 1;
    } else {
      continue;
    }

    discriminationByQuestion.set(row.examQuestionId, entry);
  }

  const aggregateByQuestion = toMap(aggregates, (row) => row.examQuestionId);
  const labelsByQuestion = new Map<string, Map<string, number>>();

  for (const row of labelRows) {
    const target = labelsByQuestion.get(row.examQuestionId) ?? new Map();
    target.set(row.label, row.count);
    labelsByQuestion.set(row.examQuestionId, target);
  }

  let invalidSnapshots = 0;
  const difficultyCounts = { ...EMPTY_DIFFICULTY_COUNTS };
  const discriminationCounts = { ...EMPTY_DISCRIMINATION_COUNTS };

  const items = questions.map((question): ItemAnalytics => {
    const parsed = parseSnapshotOrNull(question.snapshotJson);

    if (!parsed.snapshot) {
      invalidSnapshots += 1;

      return emptyItem({
        examQuestionId: question.id,
        order: question.order,
        integrityError: parsed.error ?? "Snapshot tidak valid",
        gradedTotal: totalGraded,
      });
    }

    const snapshot = parsed.snapshot;
    const type = toQuestionType(snapshot.type) ?? snapshot.type;
    const aggregate = aggregateByQuestion.get(question.id);
    const answeredCount = aggregate?.answeredCount ?? 0;
    const correctCount = aggregate?.correctCount ?? 0;
    const skipCount = Math.max(0, totalGraded - answeredCount);
    const pValueRaw = computeDifficultyIndex(correctCount, totalGraded);
    const pValue = pValueRaw === null ? null : roundMetric(pValueRaw, 2);
    const difficultyCategory = classifyDifficulty(pValueRaw);
    const labels = labelsByQuestion.get(question.id) ?? new Map();

    const distribution = buildDistribution({
      type,
      options: snapshot.options.map((option) => ({
        label: option.label,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
      labelCounts: labels,
      gradedTotal: totalGraded,
      answeredCount,
      correctCount,
    });

    let discrimination: number | null = null;
    let discriminationCategory: ItemDiscriminationCategory | null = null;
    let highGroup: ItemAnalytics["highGroup"] = null;
    let lowGroup: ItemAnalytics["lowGroup"] = null;

    if (type !== "ESSAY" && groups) {
      const counts = discriminationByQuestion.get(question.id) ?? {
        high: 0,
        low: 0,
      };
      const discriminationRaw = computeDiscrimination(
        counts.high,
        groups.size,
        counts.low,
        groups.size,
      );

      if (discriminationRaw !== null) {
        discrimination = roundMetric(discriminationRaw, 2);
        discriminationCategory = classifyDiscrimination(discriminationRaw);
        highGroup = {
          count: groups.size,
          correct: counts.high,
          rate: roundMetric(counts.high / groups.size, 2),
        };
        lowGroup = {
          count: groups.size,
          correct: counts.low,
          rate: roundMetric(counts.low / groups.size, 2),
        };
      }
    }

    if (difficultyCategory) {
      difficultyCounts[difficultyCategory] += 1;
    }

    if (discriminationCategory) {
      discriminationCounts[discriminationCategory] += 1;
    }

    const questionText = snapshot.questionText;
    const questionTextTruncated =
      questionText.length > QUESTION_TEXT_PREVIEW_LENGTH;

    return {
      examQuestionId: question.id,
      order: question.order,
      type,
      typeLabel: QUESTION_TYPE_LABEL[type] ?? type,
      questionText: questionTextTruncated
        ? `${questionText.slice(0, QUESTION_TEXT_PREVIEW_LENGTH)}…`
        : questionText,
      questionTextTruncated,
      points: question.pointsOverride ?? snapshot.points,
      integrityError: null,
      gradedTotal: totalGraded,
      answeredCount,
      correctCount,
      skipCount,
      skipRate: computeSkipRate(skipCount, totalGraded),
      pValue,
      difficultyCategory,
      discrimination,
      discriminationCategory,
      highGroup,
      lowGroup,
      distribution,
      multiSelect: type === "MULTIPLE_CHOICE",
    };
  });

  const invalidAttempts = Math.max(0, statusCounts.graded - totalGraded);

  const summary: AnalyticsSummary = {
    gradedAttempts: totalGraded,
    pendingAttempts: statusCounts.submitted,
    inProgressAttempts: statusCounts.inProgress,
    invalidAttempts,
    totalQuestions: items.length,
    objectiveQuestions: items.filter(
      (item) => item.type !== null && item.type !== "ESSAY",
    ).length,
    essayQuestions: items.filter((item) => item.type === "ESSAY").length,
    difficultyCounts,
    discriminationCounts,
    notApplicableDiscrimination: items.filter(
      (item) => item.discriminationCategory === null,
    ).length,
    sample: {
      size: rankedAttempts.length,
      totalGraded,
      truncated,
      reliable: totalGraded >= SAMPLE_RELIABLE_THRESHOLD,
      warningThreshold: SAMPLE_WARNING_THRESHOLD,
      reliableThreshold: SAMPLE_RELIABLE_THRESHOLD,
    },
    warnings: buildSampleWarnings({
      gradedTotal: totalGraded,
      invalidAttempts,
      invalidSnapshots,
      truncated,
    }),
  };

  return { summary, items };
}
