import type { QuestionType } from "@prisma/client";

import {
  attemptIntegrityError,
  type AttemptIntegrityContext,
} from "@/lib/attempts/payload";

export type GradingQuestionScore = {
  id: string;
  type: QuestionType;
  /** Poin efektif: `pointsOverride ?? snapshot.points`. */
  points: number;
};

export type GradingAnswerScore = {
  examQuestionId: string;
  score: number | null;
};

export type AttemptScoreSummary = {
  totalScore: number;
  essayCount: number;
  pendingEssayCount: number;
};

export function resolvePoints(
  pointsOverride: number | null,
  snapshotPoints: number,
): number {
  return pointsOverride ?? snapshotPoints;
}

/**
 * Satu-satunya tempat menghitung total attempt dari `Answer.score`.
 *
 * Aturan:
 * - Semua `Answer.score` non-null dijumlahkan.
 * - `Answer` objektif dengan score null adalah data rusak → 500 eksplisit.
 * - Essay tanpa `Answer` ATAU dengan score null dihitung pending. Pending
 *   selalu dihitung dari daftar ExamQuestion, bukan dari daftar Answer, supaya
 *   essay kosong (tidak dijawab) tidak membuat attempt stuck SUBMITTED.
 */
export function summarizeAttemptScore(
  questions: readonly GradingQuestionScore[],
  answers: readonly GradingAnswerScore[],
  context: AttemptIntegrityContext = {},
): AttemptScoreSummary {
  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const answerByQuestion = new Map<string, GradingAnswerScore>();

  for (const answer of answers) {
    const question = questionById.get(answer.examQuestionId);

    if (!question) {
      throw attemptIntegrityError(
        `jawaban untuk soal ${answer.examQuestionId} bukan bagian dari ujian`,
        context,
      );
    }

    answerByQuestion.set(answer.examQuestionId, answer);
  }

  let totalScore = 0;

  for (const answer of answerByQuestion.values()) {
    const question = questionById.get(answer.examQuestionId);

    if (!question) {
      continue;
    }

    if (answer.score === null) {
      if (question.type !== "ESSAY") {
        throw attemptIntegrityError(
          `jawaban objektif soal ${question.id} belum memiliki nilai`,
          { ...context, examQuestionId: question.id },
        );
      }

      continue;
    }

    if (
      !Number.isInteger(answer.score) ||
      answer.score < 0 ||
      answer.score > question.points
    ) {
      throw attemptIntegrityError(
        `nilai soal ${question.id} (${answer.score}) di luar rentang 0..${question.points}`,
        { ...context, examQuestionId: question.id },
      );
    }

    totalScore += answer.score;
  }

  let essayCount = 0;
  let pendingEssayCount = 0;

  for (const question of questions) {
    if (question.type !== "ESSAY") {
      continue;
    }

    essayCount += 1;

    const answer = answerByQuestion.get(question.id);

    if (!answer || answer.score === null) {
      pendingEssayCount += 1;
    }
  }

  return {
    totalScore,
    essayCount,
    pendingEssayCount,
  };
}
