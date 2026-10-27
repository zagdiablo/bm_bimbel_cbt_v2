import { Prisma, type QuestionType } from "@prisma/client";

import { HttpError } from "@/lib/api";
import { parseExamSnapshot } from "@/lib/exams/snapshot";
import { normalizeExamToken } from "@/lib/exams/token";
import { prisma } from "@/lib/prisma";
import type { AnswerInput } from "@/lib/zod-schemas/attempt";

import { gradeAnswer } from "./grade";
import {
  assertQuestionOrder,
  attemptIntegrityError,
  isShuffledOptionType,
  parseOptionOrderMap,
  toSafeAnswer,
  toStudentQuestionView,
} from "./payload";
import { shuffledCopy } from "./shuffle";
import {
  effectiveSubmittedAt,
  hasExpired,
  nowDate,
  remainingMs,
} from "./time";

const attemptExamSelect = {
  id: true,
  title: true,
  durationMinutes: true,
  startAt: true,
  endAt: true,
  status: true,
  showResult: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  subject: { select: { name: true, code: true } },
} satisfies Prisma.ExamSelect;

const attemptInclude = {
  exam: { select: attemptExamSelect },
} satisfies Prisma.AttemptInclude;

type AttemptWithExam = Prisma.AttemptGetPayload<{
  include: typeof attemptInclude;
}>;

const attemptQuestionSelect = {
  id: true,
  order: true,
  pointsOverride: true,
  snapshotJson: true,
} satisfies Prisma.ExamQuestionSelect;

const answerSelect = {
  id: true,
  examQuestionId: true,
  selectedLabels: true,
  textAnswer: true,
  answeredAt: true,
  revision: true,
} satisfies Prisma.AnswerSelect;

function parseSnapshotOrThrow(snapshotJson: unknown, examQuestionId: string) {
  try {
    return parseExamSnapshot(snapshotJson);
  } catch {
    throw new HttpError(
      500,
      `Data ujian tidak konsisten: snapshot soal ${examQuestionId} tidak valid`,
    );
  }
}

function effectivePoints(
  pointsOverride: number | null,
  snapshotPoints: number,
) {
  return pointsOverride ?? snapshotPoints;
}

async function findAttemptWithExam(
  attemptId: string,
  studentId: string,
): Promise<AttemptWithExam | null> {
  return prisma.attempt.findFirst({
    where: { id: attemptId, studentId },
    include: attemptInclude,
  });
}

async function findAttemptOrThrow(
  attemptId: string,
  studentId: string,
): Promise<AttemptWithExam> {
  const attempt = await findAttemptWithExam(attemptId, studentId);

  if (!attempt) {
    throw new HttpError(404, "Attempt tidak ditemukan");
  }

  return attempt;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type JoinAttemptResult = {
  attempt: AttemptWithExam;
  created: boolean;
};

/**
 * Join selalu idempotent. Attempt existing dikembalikan lebih dulu, bahkan
 * jika jadwal sudah lewat atau ujian sudah CLOSED, supaya siswa tetap bisa
 * menyelesaikan/melihat hasilnya.
 */
export async function joinAttempt(
  studentId: string,
  tokenInput: string,
): Promise<JoinAttemptResult> {
  const token = normalizeExamToken(tokenInput);
  const exam = await prisma.exam.findUnique({
    where: { token },
    select: attemptExamSelect,
  });

  if (!exam) {
    throw new HttpError(404, "Token ujian tidak valid");
  }

  const existing = await prisma.attempt.findUnique({
    where: { examId_studentId: { examId: exam.id, studentId } },
    include: attemptInclude,
  });

  if (existing) {
    const attempt =
      existing.status === "IN_PROGRESS" && hasExpired(existing.expiresAt)
        ? await finalizeAttempt(existing.id, studentId)
        : existing;

    return { attempt, created: false };
  }

  if (exam.status !== "PUBLISHED") {
    throw new HttpError(403, "Ujian tidak sedang berlangsung");
  }

  if (!exam.startAt || !exam.endAt) {
    throw new HttpError(403, "Jadwal ujian tidak lengkap");
  }

  const now = nowDate();

  if (now.getTime() < exam.startAt.getTime()) {
    throw new HttpError(403, "Ujian belum dimulai");
  }

  if (now.getTime() >= exam.endAt.getTime()) {
    throw new HttpError(403, "Waktu ujian sudah berakhir");
  }

  const questions = await prisma.examQuestion.findMany({
    where: { examId: exam.id },
    orderBy: { order: "asc" },
    select: attemptQuestionSelect,
  });

  if (questions.length === 0) {
    throw new HttpError(500, "Data ujian tidak konsisten: tidak ada soal");
  }

  const parsed = questions.map((question) => ({
    ...question,
    snapshot: parseSnapshotOrThrow(question.snapshotJson, question.id),
  }));

  const baseOrder = parsed.map((question) => question.id);
  const questionOrder = exam.shuffleQuestions
    ? shuffledCopy(baseOrder)
    : baseOrder;
  const maxScore = parsed.reduce(
    (total, question) =>
      total + effectivePoints(question.pointsOverride, question.snapshot.points),
    0,
  );

  let optionOrder: Record<string, string[]> | null = null;

  if (exam.shuffleOptions) {
    optionOrder = {};

    for (const question of parsed) {
      if (!isShuffledOptionType(question.snapshot.type)) {
        continue;
      }

      optionOrder[question.id] = shuffledCopy(
        question.snapshot.options.map((option) => option.label),
      );
    }

    if (Object.keys(optionOrder).length === 0) {
      optionOrder = null;
    }
  }

  const expiresAt = new Date(
    Math.min(
      now.getTime() + exam.durationMinutes * 60_000,
      exam.endAt.getTime(),
    ),
  );

  try {
    const attempt = await prisma.attempt.create({
      data: {
        examId: exam.id,
        studentId,
        startedAt: now,
        expiresAt,
        maxScore,
        questionOrder,
        ...(optionOrder
          ? { optionOrder: optionOrder as Prisma.InputJsonValue }
          : {}),
      },
      include: attemptInclude,
    });

    return { attempt, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const raced = await prisma.attempt.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId } },
      include: attemptInclude,
    });

    if (!raced) {
      throw error;
    }

    const attempt =
      raced.status === "IN_PROGRESS" && hasExpired(raced.expiresAt)
        ? await finalizeAttempt(raced.id, studentId)
        : raced;

    return { attempt, created: false };
  }
}

/**
 * Menyelesaikan attempt secara idempotent. Dipakai oleh submit eksplisit,
 * lazy finalize saat GET, dan join/resume.
 */
export async function finalizeAttempt(
  attemptId: string,
  studentId: string,
  options: { now?: Date } = {},
): Promise<AttemptWithExam> {
  const now = options.now ?? nowDate();

  return prisma.$transaction(
    async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, studentId },
        include: attemptInclude,
      });

      if (!attempt) {
        throw new HttpError(404, "Attempt tidak ditemukan");
      }

      if (attempt.status !== "IN_PROGRESS") {
        return attempt;
      }

      const submittedAt = effectiveSubmittedAt(attempt.expiresAt, now);
      const claimed = await tx.attempt.updateMany({
        where: { id: attemptId, studentId, status: "IN_PROGRESS" },
        data: {
          status: "SUBMITTED",
          submittedAt,
          receivedAt: now,
        },
      });

      if (claimed.count === 0) {
        return tx.attempt.findFirstOrThrow({
          where: { id: attemptId, studentId },
          include: attemptInclude,
        });
      }

      const questions = await tx.examQuestion.findMany({
        where: { examId: attempt.examId },
        orderBy: { order: "asc" },
        select: attemptQuestionSelect,
      });
      const integrityContext = {
        attemptId: attempt.id,
        examId: attempt.examId,
      };
      const questionOrder = assertQuestionOrder(
        attempt.questionOrder,
        questions,
        integrityContext,
      );
      const byId = new Map(questions.map((question) => [question.id, question]));

      const answers = await tx.answer.findMany({
        where: { attemptId },
        select: answerSelect,
      });
      const answerByQuestion = new Map(
        answers.map((answer) => [answer.examQuestionId, answer]),
      );

      let totalScore = 0;
      let hasEssay = false;

      for (const examQuestionId of questionOrder) {
        const question = byId.get(examQuestionId);

        if (!question) {
          throw attemptIntegrityError(
            `soal ${examQuestionId} tidak ditemukan saat penilaian`,
            integrityContext,
          );
        }

        const snapshot = parseSnapshotOrThrow(
          question.snapshotJson,
          question.id,
        );
        const points = effectivePoints(
          question.pointsOverride,
          snapshot.points,
        );

        if (snapshot.type === "ESSAY") {
          hasEssay = true;
        }

        const answer = answerByQuestion.get(examQuestionId);

        if (!answer) {
          continue;
        }

        const grade = gradeAnswer(
          snapshot,
          {
            selectedLabels: answer.selectedLabels,
            textAnswer: answer.textAnswer,
          },
          points,
        );

        await tx.answer.update({
          where: { id: answer.id },
          data: {
            isCorrect: grade.isCorrect,
            score: grade.score,
          },
        });

        if (grade.score !== null) {
          totalScore += grade.score;
        }
      }

      return tx.attempt.update({
        where: { id: attemptId },
        data: {
          status: hasEssay ? "SUBMITTED" : "GRADED",
          totalScore,
          gradedAt: hasEssay ? null : now,
        },
        include: attemptInclude,
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export type AttemptState =
  | {
      attemptId: string;
      examId: string;
      examTitle: string;
      subject: { name: string; code: string };
      status: "IN_PROGRESS";
      startedAt: string;
      expiresAt: string;
      serverNow: string;
      durationMinutes: number;
      maxScore: number;
      questionOrder: string[];
      questions: ReturnType<typeof toStudentQuestionView>[];
      isExpired: false;
      showResult: boolean;
    }
  | {
      attemptId: string;
      examId: string;
      examTitle: string;
      subject: { name: string; code: string };
      status: "SUBMITTED" | "GRADED";
      startedAt: string;
      expiresAt: string;
      submittedAt: string | null;
      gradedAt: string | null;
      serverNow: string;
      durationMinutes: number;
      maxScore: number | null;
      totalScore: number | null;
      questions: [];
      isExpired: boolean;
      showResult: boolean;
      redirectTo: string;
    };

export async function getAttemptState(
  attemptId: string,
  studentId: string,
): Promise<AttemptState> {
  let attempt = await findAttemptOrThrow(attemptId, studentId);

  if (attempt.status === "IN_PROGRESS" && hasExpired(attempt.expiresAt)) {
    attempt = await finalizeAttempt(attemptId, studentId);
  }

  const now = nowDate();

  if (attempt.status !== "IN_PROGRESS") {
    const showScore = attempt.exam.showResult && attempt.status === "GRADED";

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam.title,
      subject: attempt.exam.subject,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      gradedAt: attempt.gradedAt?.toISOString() ?? null,
      serverNow: now.toISOString(),
      durationMinutes: attempt.exam.durationMinutes,
      maxScore: showScore ? attempt.maxScore : null,
      totalScore: showScore ? attempt.totalScore : null,
      questions: [],
      isExpired: hasExpired(attempt.expiresAt, now),
      showResult: attempt.exam.showResult,
      redirectTo: attempt.exam.showResult
        ? `/student/exams/${attempt.examId}/result`
        : "/student/exams",
    };
  }

  const questions = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    orderBy: { order: "asc" },
    select: attemptQuestionSelect,
  });
  const integrityContext = {
    attemptId: attempt.id,
    examId: attempt.examId,
  };
  const questionOrder = assertQuestionOrder(
    attempt.questionOrder,
    questions,
    integrityContext,
  );
  const byId = new Map(questions.map((question) => [question.id, question]));
  const optionOrder = parseOptionOrderMap(
    attempt.optionOrder,
    integrityContext,
  );
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: answerSelect,
  });
  const answerByQuestion = new Map(
    answers.map((answer) => [answer.examQuestionId, answer]),
  );

  if (attempt.exam.shuffleOptions) {
    for (const question of questions) {
      const snapshot = parseSnapshotOrThrow(
        question.snapshotJson,
        question.id,
      );

      if (
        isShuffledOptionType(snapshot.type) &&
        !optionOrder?.[question.id]
      ) {
        throw attemptIntegrityError(
          `optionOrder soal ${question.id} tidak tersedia`,
          integrityContext,
        );
      }
    }
  }

  const views = questionOrder.map((examQuestionId) => {
    const question = byId.get(examQuestionId);

    if (!question) {
      throw attemptIntegrityError(
        `soal ${examQuestionId} tidak ditemukan saat menyusun payload`,
        integrityContext,
      );
    }

    return toStudentQuestionView(
      { ...question, examStatus: "PUBLISHED" },
      answerByQuestion.get(examQuestionId) ?? null,
      optionOrder?.[examQuestionId] ?? null,
      integrityContext,
    );
  });

  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.exam.title,
    subject: attempt.exam.subject,
    status: "IN_PROGRESS",
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    durationMinutes: attempt.exam.durationMinutes,
    maxScore: attempt.maxScore,
    questionOrder,
    questions: views,
    isExpired: false,
    showResult: attempt.exam.showResult,
  };
}

function validateChoiceLabels(
  snapshotType: QuestionType,
  labels: string[],
  allowedLabels: Set<string>,
) {
  if (labels.some((label) => !allowedLabels.has(label))) {
    throw new HttpError(400, "Label jawaban tidak dikenal untuk soal ini");
  }

  if (
    (snapshotType === "SINGLE_CHOICE" || snapshotType === "TRUE_FALSE") &&
    labels.length > 1
  ) {
    throw new HttpError(400, "Soal ini hanya menerima satu jawaban");
  }
}

export type SaveAnswerResult = {
  updated: boolean;
  reason?: "stale";
  revision: number;
  answeredAt: string | null;
  answer: ReturnType<typeof toSafeAnswer>;
};

export async function saveAttemptAnswer(
  attemptId: string,
  studentId: string,
  examQuestionId: string,
  input: AnswerInput,
  options: { now?: Date } = {},
): Promise<SaveAnswerResult> {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      examId: true,
      questionOrder: true,
    },
  });

  if (!attempt) {
    throw new HttpError(404, "Attempt tidak ditemukan");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new HttpError(409, "Ujian sudah disubmit");
  }

  const now = options.now ?? nowDate();

  if (hasExpired(attempt.expiresAt, now)) {
    throw new HttpError(403, "Waktu ujian habis");
  }

  if (!attempt.questionOrder.includes(examQuestionId)) {
    throw new HttpError(404, "Soal bukan bagian dari attempt ini");
  }

  const question = await prisma.examQuestion.findFirst({
    where: { id: examQuestionId, examId: attempt.examId },
    select: { id: true, examId: true, pointsOverride: true, snapshotJson: true },
  });

  if (!question) {
    throw new HttpError(404, "Soal tidak ditemukan");
  }

  const snapshot = parseSnapshotOrThrow(question.snapshotJson, question.id);
  const isTextType =
    snapshot.type === "SHORT_ANSWER" || snapshot.type === "ESSAY";

  let data: {
    selectedLabels: string[];
    textAnswer: string | null;
    isCorrect: null;
    score: null;
  };

  if (isTextType) {
    if (input.textAnswer === undefined) {
      throw new HttpError(400, "Soal ini membutuhkan jawaban teks");
    }

    const text = input.textAnswer;

    data = {
      selectedLabels: [],
      textAnswer: text.trim() === "" ? null : text,
      isCorrect: null,
      score: null,
    };
  } else {
    if (input.selectedLabels === undefined) {
      throw new HttpError(400, "Soal ini membutuhkan pilihan label");
    }

    const allowedLabels = new Set(
      snapshot.options.map((option) => option.label),
    );
    validateChoiceLabels(snapshot.type, input.selectedLabels, allowedLabels);

    data = {
      selectedLabels: input.selectedLabels,
      textAnswer: null,
      isCorrect: null,
      score: null,
    };
  }

  const staleResult = async (): Promise<SaveAnswerResult> => {
    const current = await prisma.answer.findUnique({
      where: {
        attemptId_examQuestionId: { attemptId, examQuestionId },
      },
      select: answerSelect,
    });

    return {
      updated: false,
      reason: "stale",
      revision: current?.revision ?? 0,
      answeredAt: current?.answeredAt.toISOString() ?? null,
      answer: current ? toSafeAnswer(current) : null,
    };
  };

  if (input.baseRevision === 0) {
    const existing = await prisma.answer.findUnique({
      where: { attemptId_examQuestionId: { attemptId, examQuestionId } },
      select: { id: true },
    });

    if (existing) {
      return staleResult();
    }

    try {
      const created = await prisma.answer.create({
        data: {
          attemptId,
          examQuestionId,
          ...data,
          revision: 1,
          answeredAt: now,
        },
        select: answerSelect,
      });

      return {
        updated: true,
        revision: created.revision,
        answeredAt: created.answeredAt.toISOString(),
        answer: toSafeAnswer(created),
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      return staleResult();
    }
  }

  const updated = await prisma.answer.updateMany({
    where: {
      attemptId,
      examQuestionId,
      revision: input.baseRevision,
    },
    data: {
      ...data,
      revision: { increment: 1 },
      answeredAt: now,
    },
  });

  if (updated.count === 0) {
    return staleResult();
  }

  const current = await prisma.answer.findUniqueOrThrow({
    where: { attemptId_examQuestionId: { attemptId, examQuestionId } },
    select: answerSelect,
  });

  return {
    updated: true,
    revision: current.revision,
    answeredAt: current.answeredAt.toISOString(),
    answer: toSafeAnswer(current),
  };
}

export type SubmitAttemptResult = {
  status: "SUBMITTED" | "GRADED";
  totalScore: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  receivedAt: string | null;
  gradedAt: string | null;
  showResult: boolean;
  message: string;
};

export async function submitAttempt(
  attemptId: string,
  studentId: string,
  options: { now?: Date } = {},
): Promise<SubmitAttemptResult> {
  const attempt = await finalizeAttempt(attemptId, studentId, options);

  if (attempt.status === "IN_PROGRESS") {
    throw new HttpError(500, "Gagal menyelesaikan ujian");
  }

  const showScore = attempt.exam.showResult && attempt.status === "GRADED";
  const pending = attempt.status === "SUBMITTED";

  return {
    status: attempt.status,
    totalScore: showScore ? attempt.totalScore : null,
    maxScore: showScore ? attempt.maxScore : null,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    receivedAt: attempt.receivedAt?.toISOString() ?? null,
    gradedAt: attempt.gradedAt?.toISOString() ?? null,
    showResult: attempt.exam.showResult,
    message: pending
      ? "Jawaban objektif tersimpan. Menunggu penilaian essay oleh guru."
      : "Ujian selesai dan sudah dinilai.",
  };
}

export type AttemptTimeResult = {
  serverNow: string;
  expiresAt: string;
  remainingMs: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
};

export async function getAttemptTime(
  attemptId: string,
  studentId: string,
): Promise<AttemptTimeResult> {
  let attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId },
    select: { id: true, status: true, expiresAt: true },
  });

  if (!attempt) {
    throw new HttpError(404, "Attempt tidak ditemukan");
  }

  const now = nowDate();

  if (attempt.status === "IN_PROGRESS" && hasExpired(attempt.expiresAt, now)) {
    const finalized = await finalizeAttempt(attemptId, studentId, { now });
    attempt = {
      id: finalized.id,
      status: finalized.status,
      expiresAt: finalized.expiresAt,
    };
  }

  return {
    serverNow: now.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    remainingMs:
      attempt.status === "IN_PROGRESS"
        ? remainingMs(attempt.expiresAt, now)
        : 0,
    status: attempt.status,
  };
}

export type AttemptListItem = {
  id: string;
  examId: string;
  examTitle: string;
  subject: { name: string; code: string };
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  isExpired: boolean;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  totalScore: number | null;
  maxScore: number | null;
  showResult: boolean;
  redirectTo: string;
};

export async function listStudentAttempts(
  studentId: string,
): Promise<{ items: AttemptListItem[] }> {
  const attempts = await prisma.attempt.findMany({
    where: { studentId },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: attemptInclude,
  });
  const now = nowDate();

  return {
    items: attempts.map((attempt) => {
      const showScore =
        attempt.exam.showResult && attempt.status === "GRADED";
      const expired =
        attempt.status === "IN_PROGRESS" &&
        hasExpired(attempt.expiresAt, now);

      return {
        id: attempt.id,
        examId: attempt.examId,
        examTitle: attempt.exam.title,
        subject: attempt.exam.subject,
        status: attempt.status,
        isExpired: expired,
        startedAt: attempt.startedAt.toISOString(),
        expiresAt: attempt.expiresAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        gradedAt: attempt.gradedAt?.toISOString() ?? null,
        totalScore: showScore ? attempt.totalScore : null,
        maxScore: showScore ? attempt.maxScore : null,
        showResult: attempt.exam.showResult,
        redirectTo:
          attempt.status === "IN_PROGRESS"
            ? `/student/exams/${attempt.examId}/take`
            : `/student/exams/${attempt.examId}/result`,
      };
    }),
  };
}

export type StudentExamItem = {
  id: string;
  title: string;
  subject: { name: string; code: string };
  durationMinutes: number;
  startAt: string;
  endAt: string;
  showResult: boolean;
  attempt: {
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
    isExpired: boolean;
    totalScore: number | null;
    maxScore: number | null;
  } | null;
};

/**
 * Ujian yang sedang terbuka untuk siswa. Attempts diambil terpisah supaya
 * token tidak pernah ikut ter-select.
 */
export async function listStudentExams(
  studentId: string,
): Promise<{ items: StudentExamItem[] }> {
  const now = nowDate();
  const exams = await prisma.exam.findMany({
    where: {
      status: "PUBLISHED",
      startAt: { lte: now },
      endAt: { gte: now },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      title: true,
      durationMinutes: true,
      startAt: true,
      endAt: true,
      showResult: true,
      subject: { select: { name: true, code: true } },
      attempts: {
        where: { studentId },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          totalScore: true,
          maxScore: true,
        },
      },
    },
  });

  return {
    items: exams.map((exam) => {
      const attempt = exam.attempts[0] ?? null;
      const showScore = exam.showResult && attempt?.status === "GRADED";

      return {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        durationMinutes: exam.durationMinutes,
        startAt: exam.startAt!.toISOString(),
        endAt: exam.endAt!.toISOString(),
        showResult: exam.showResult,
        attempt: attempt
          ? {
              id: attempt.id,
              status: attempt.status,
              isExpired:
                attempt.status === "IN_PROGRESS" &&
                hasExpired(attempt.expiresAt, now),
              totalScore: showScore ? attempt.totalScore : null,
              maxScore: showScore ? attempt.maxScore : null,
            }
          : null,
      };
    }),
  };
}

export async function findAttemptByExam(
  examId: string,
  studentId: string,
): Promise<AttemptWithExam | null> {
  return prisma.attempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: attemptInclude,
  });
}

export type AttemptResult = {
  status: "SUBMITTED" | "GRADED";
  examTitle: string;
  totalScore: number | null;
  maxScore: number;
  submittedAt: string | null;
  gradedAt: string | null;
  showResult: true;
  message: string | null;
};

export async function getAttemptResult(
  attemptId: string,
  studentId: string,
): Promise<AttemptResult> {
  let attempt = await findAttemptOrThrow(attemptId, studentId);

  if (
    attempt.status === "IN_PROGRESS" &&
    hasExpired(attempt.expiresAt, nowDate())
  ) {
    attempt = await finalizeAttempt(attemptId, studentId);
  }

  if (attempt.status === "IN_PROGRESS") {
    throw new HttpError(409, "Ujian belum disubmit");
  }

  if (!attempt.exam.showResult) {
    throw new HttpError(403, "Hasil ujian tidak ditampilkan");
  }

  return {
    status: attempt.status,
    examTitle: attempt.exam.title,
    totalScore: attempt.status === "GRADED" ? attempt.totalScore : null,
    maxScore: attempt.maxScore,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    gradedAt: attempt.gradedAt?.toISOString() ?? null,
    showResult: true,
    message:
      attempt.status === "SUBMITTED"
        ? "Menunggu penilaian essay oleh guru."
        : null,
  };
}
