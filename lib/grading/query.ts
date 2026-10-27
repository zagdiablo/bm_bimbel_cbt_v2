import type { Prisma } from "@prisma/client";

import { HttpError } from "@/lib/api";
import { finalizeAttempt } from "@/lib/attempts/service";
import { hasExpired, nowDate } from "@/lib/attempts/time";
import { attemptIntegrityError } from "@/lib/attempts/payload";
import type { AuthUser } from "@/lib/auth-helpers";
import { examScopeWhere } from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";

import { LAZY_SWEEP_LIMIT } from "./constants";
import { isLateSubmission } from "./late";
import { resolvePoints, summarizeAttemptScore } from "./recompute";
import { parseGradingSnapshot } from "./snapshot";
import type {
  GradingAnswerView,
  GradingAttemptInfo,
  GradingDetail,
  GradingEssayItem,
  GradingListQuery,
  GradingListResult,
  GradingObjectiveItem,
} from "./types";

export const gradingAttemptInclude = {
  exam: {
    select: {
      id: true,
      title: true,
      showResult: true,
      subject: { select: { name: true, code: true } },
    },
  },
  student: { select: { id: true, name: true, classroom: true } },
  gradedBy: { select: { id: true, name: true } },
  answers: {
    select: {
      id: true,
      examQuestionId: true,
      selectedLabels: true,
      textAnswer: true,
      isCorrect: true,
      score: true,
      revision: true,
      answeredAt: true,
      gradedAt: true,
      gradedById: true,
      gradedBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.AttemptInclude;

export type GradingAttemptRecord = Prisma.AttemptGetPayload<{
  include: typeof gradingAttemptInclude;
}>;

const gradingListInclude = {
  exam: {
    select: {
      id: true,
      title: true,
      subject: { select: { name: true, code: true } },
    },
  },
  student: { select: { id: true, name: true, classroom: true } },
  answers: { select: { examQuestionId: true, score: true } },
} satisfies Prisma.AttemptInclude;

async function findGradingAttempt(
  attemptId: string,
  user: AuthUser,
): Promise<GradingAttemptRecord | null> {
  return prisma.attempt.findFirst({
    where: { id: attemptId, exam: { is: examScopeWhere(user) } },
    include: gradingAttemptInclude,
  });
}

export async function listGradingExamOptions(user: AuthUser) {
  return prisma.exam.findMany({
    where: examScopeWhere(user),
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Finalisasi lazy attempt yang sudah lewat expiry. Limit mencegah satu request
 * memicu terlalu banyak transaksi; sisa attempt diproses pada request berikut.
 */
async function sweepExpiredAttempts(user: AuthUser): Promise<number> {
  const now = nowDate();
  const expired = await prisma.attempt.findMany({
    where: {
      status: "IN_PROGRESS",
      expiresAt: { lte: now },
      exam: { is: examScopeWhere(user) },
    },
    orderBy: { expiresAt: "asc" },
    take: LAZY_SWEEP_LIMIT,
    select: { id: true, studentId: true },
  });

  if (expired.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(
    expired.map((attempt) =>
      finalizeAttempt(attempt.id, attempt.studentId, { now }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `[grading] gagal finalisasi attempt ${expired[index]?.id}:`,
        result.reason,
      );
    }
  });

  return results.filter((result) => result.status === "fulfilled").length;
}

export async function listPendingGrading(
  user: AuthUser,
  query: GradingListQuery,
): Promise<GradingListResult> {
  const swept = await sweepExpiredAttempts(user);
  const where: Prisma.AttemptWhereInput = {
    status: "SUBMITTED",
    exam: { is: examScopeWhere(user) },
    ...(query.examId ? { examId: query.examId } : {}),
    ...(query.search
      ? {
          student: {
            is: {
              name: { contains: query.search, mode: "insensitive" },
            },
          },
        }
      : {}),
  };
  const { page, pageSize } = query;

  const [items, total] = await prisma.$transaction([
    prisma.attempt.findMany({
      where,
      include: gradingListInclude,
      orderBy: [{ submittedAt: "asc" }, { startedAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.attempt.count({ where }),
  ]);

  const examIds = [...new Set(items.map((item) => item.examId))];
  const questions =
    examIds.length > 0
      ? await prisma.examQuestion.findMany({
          where: { examId: { in: examIds } },
          select: { id: true, examId: true, snapshotJson: true },
        })
      : [];
  const questionsByExam = new Map<string, typeof questions>();

  for (const question of questions) {
    const current = questionsByExam.get(question.examId) ?? [];

    current.push(question);
    questionsByExam.set(question.examId, current);
  }

  return {
    items: items.map((item) => {
      const attemptQuestions = questionsByExam.get(item.examId) ?? [];
      const answerScores = new Map(
        item.answers.map((answer) => [
          answer.examQuestionId,
          answer.score,
        ]),
      );
      let essayCount = 0;
      let pendingEssayCount = 0;
      let integrityError: string | null = null;

      try {
        const parsed = attemptQuestions.map((question) => ({
          id: question.id,
          type: parseGradingSnapshot(question.snapshotJson, {
            attemptId: item.id,
            examId: item.examId,
            examQuestionId: question.id,
          }).type,
        }));

        essayCount = parsed.filter(
          (question) => question.type === "ESSAY",
        ).length;
        pendingEssayCount = parsed.filter(
          (question) =>
            question.type === "ESSAY" &&
            (answerScores.get(question.id) ?? null) === null,
        ).length;
      } catch (error) {
        integrityError =
          error instanceof Error
            ? error.message
            : "Data snapshot soal tidak valid";
      }

      return {
        id: item.id,
        examId: item.examId,
        examTitle: item.exam.title,
        subject: item.exam.subject,
        student: item.student,
        submittedAt: item.submittedAt?.toISOString() ?? null,
        receivedAt: item.receivedAt?.toISOString() ?? null,
        isLate: isLateSubmission(item.submittedAt, item.receivedAt),
        totalScore: item.totalScore,
        maxScore: item.maxScore,
        essayCount,
        pendingEssayCount,
        integrityError,
      };
    }),
    total,
    page,
    pageSize,
    swept,
  };
}

function toAnswerView(
  answer: GradingAttemptRecord["answers"][number],
): GradingAnswerView {
  return {
    id: answer.id,
    selectedLabels: answer.selectedLabels,
    textAnswer: answer.textAnswer,
    isCorrect: answer.isCorrect,
    score: answer.score,
    revision: answer.revision,
    answeredAt: answer.answeredAt.toISOString(),
    gradedAt: answer.gradedAt?.toISOString() ?? null,
    gradedById: answer.gradedById,
    gradedByName: answer.gradedBy?.name ?? null,
  };
}

export async function getGradingDetail(
  attemptId: string,
  user: AuthUser,
): Promise<GradingDetail> {
  const now = nowDate();
  let attempt = await findGradingAttempt(attemptId, user);

  if (!attempt) {
    throw new HttpError(404, "Attempt tidak ditemukan");
  }

  if (attempt.status === "IN_PROGRESS") {
    if (!hasExpired(attempt.expiresAt, now)) {
      throw new HttpError(409, "Attempt masih dikerjakan siswa");
    }

    await finalizeAttempt(attempt.id, attempt.studentId, { now });
    attempt = await findGradingAttempt(attemptId, user);

    if (!attempt) {
      throw new HttpError(404, "Attempt tidak ditemukan");
    }
  }

  if (attempt.status === "IN_PROGRESS") {
    throw new HttpError(409, "Attempt masih dikerjakan siswa");
  }

  const questions = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      pointsOverride: true,
      snapshotJson: true,
    },
  });
  const parsed = questions.map((question) => {
    const snapshot = parseGradingSnapshot(question.snapshotJson, {
      attemptId,
      examId: attempt.examId,
      examQuestionId: question.id,
    });

    return {
      id: question.id,
      order: question.order,
      pointsOverride: question.pointsOverride,
      points: resolvePoints(question.pointsOverride, snapshot.points),
      snapshot,
    };
  });
  const summary = summarizeAttemptScore(
    parsed.map((question) => ({
      id: question.id,
      type: question.snapshot.type,
      points: question.points,
    })),
    attempt.answers.map((answer) => ({
      examQuestionId: answer.examQuestionId,
      score: answer.score,
    })),
    { attemptId, examId: attempt.examId },
  );

  if (attempt.status === "GRADED" && summary.pendingEssayCount > 0) {
    throw attemptIntegrityError(
      "attempt berstatus GRADED masih memiliki essay yang belum dinilai",
      { attemptId, examId: attempt.examId },
    );
  }

  const answerByQuestion = new Map(
    attempt.answers.map((answer) => [answer.examQuestionId, answer]),
  );
  const essays: GradingEssayItem[] = [];
  const objectives: GradingObjectiveItem[] = [];

  for (const question of parsed) {
    const answer = answerByQuestion.get(question.id);
    const answerView = answer ? toAnswerView(answer) : null;

    if (question.snapshot.type === "ESSAY") {
      essays.push({
        examQuestionId: question.id,
        order: question.order,
        questionText: question.snapshot.questionText,
        explanation: question.snapshot.explanation,
        points: question.points,
        pointsOverride: question.pointsOverride,
        answer: answerView,
      });
      continue;
    }

    objectives.push({
      examQuestionId: question.id,
      order: question.order,
      type: question.snapshot.type,
      questionText: question.snapshot.questionText,
      explanation: question.snapshot.explanation,
      points: question.points,
      pointsOverride: question.pointsOverride,
      correctLabels: question.snapshot.options
        .filter((option) => option.isCorrect)
        .map((option) => option.label),
      correctAnswers: question.snapshot.options
        .filter((option) => option.isCorrect)
        .map((option) => option.text),
      answer: answerView,
    });
  }

  const attemptInfo: GradingAttemptInfo = {
    id: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    subject: attempt.exam.subject,
    student: attempt.student,
    status: attempt.status === "GRADED" ? "GRADED" : "SUBMITTED",
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    receivedAt: attempt.receivedAt?.toISOString() ?? null,
    gradedAt: attempt.gradedAt?.toISOString() ?? null,
    gradedById: attempt.gradedById,
    gradedByName: attempt.gradedBy?.name ?? null,
    totalScore: attempt.totalScore,
    maxScore: attempt.maxScore,
    showResult: attempt.exam.showResult,
    isLate: isLateSubmission(attempt.submittedAt, attempt.receivedAt),
  };

  return {
    attempt: attemptInfo,
    essays,
    objectives,
    summary: {
      totalScore: summary.totalScore,
      essayCount: summary.essayCount,
      pendingEssayCount: summary.pendingEssayCount,
      canFinalize:
        attempt.status === "SUBMITTED" &&
        summary.pendingEssayCount === 0,
    },
  };
}
