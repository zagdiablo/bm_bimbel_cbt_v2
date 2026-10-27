import type { Prisma, Role } from "@prisma/client";

import {
  snapshotQuestionSelect,
  toExamQuestionView,
  type ExamQuestionView,
} from "@/lib/exams/snapshot";
import { prisma } from "@/lib/prisma";
import {
  questionScopeWhere,
  subjectSelect,
} from "@/lib/questions/query";
import type { ExamInput, ExamListQuery } from "@/lib/zod-schemas/exam";

export type ExamScopeUser = { id: string; role: Role };

export type ExamFilters = Pick<
  ExamListQuery,
  "status" | "subjectId" | "search" | "startFrom" | "startTo"
>;

/** ADMIN super-user; TEACHER hanya exam miliknya. */
export function examScopeWhere(user: ExamScopeUser): Prisma.ExamWhereInput {
  return user.role === "TEACHER" ? { ownerId: user.id } : {};
}

export function buildExamWhere(
  query: ExamFilters,
  user: ExamScopeUser,
): Prisma.ExamWhereInput {
  const filters: Prisma.ExamWhereInput[] = [examScopeWhere(user)];

  if (query.status) {
    filters.push({ status: query.status });
  }

  if (query.subjectId) {
    filters.push({ subjectId: query.subjectId });
  }

  if (query.search) {
    filters.push({
      title: { contains: query.search, mode: "insensitive" },
    });
  }

  if (query.startFrom) {
    filters.push({ startAt: { gte: new Date(query.startFrom) } });
  }

  if (query.startTo) {
    filters.push({ startAt: { lte: new Date(query.startTo) } });
  }

  return { AND: filters };
}

export const examOwnerSelect = {
  id: true,
  name: true,
} satisfies Prisma.UserSelect;

export const examListInclude = {
  subject: { select: subjectSelect },
  owner: { select: examOwnerSelect },
  _count: { select: { questions: true } },
} satisfies Prisma.ExamInclude;

export type ExamListItem = Prisma.ExamGetPayload<{
  include: typeof examListInclude;
}>;

export async function listExams(
  query: ExamListQuery,
  user: ExamScopeUser,
) {
  const where = buildExamWhere(query, user);
  const { page, pageSize } = query;

  const [items, total] = await prisma.$transaction([
    prisma.exam.findMany({
      where,
      include: examListInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exam.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

const examDetailInclude = {
  subject: { select: subjectSelect },
  owner: { select: examOwnerSelect },
  publishedBy: { select: examOwnerSelect },
  closedBy: { select: examOwnerSelect },
  _count: { select: { questions: true } },
} satisfies Prisma.ExamInclude;

export async function findExamForUser(id: string, user: ExamScopeUser) {
  return prisma.exam.findFirst({
    where: { id, ...examScopeWhere(user) },
    include: examDetailInclude,
  });
}

export const examQuestionBaseSelect = {
  id: true,
  questionId: true,
  order: true,
  pointsOverride: true,
  snapshotJson: true,
} satisfies Prisma.ExamQuestionSelect;

export async function listExamQuestions(examId: string) {
  return prisma.examQuestion.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: examQuestionBaseSelect,
  });
}

export async function listExamQuestionsWithLiveQuestion(examId: string) {
  return prisma.examQuestion.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: {
      ...examQuestionBaseSelect,
      question: { select: snapshotQuestionSelect },
    },
  });
}

export type ExamQuestionDetail = {
  id: string;
  order: number;
  points: number;
  pointsOverride: number | null;
  source: "live" | "snapshot";
  sourceAvailable: boolean;
  snapshot: ReturnType<typeof toExamQuestionView>["snapshot"];
};

export type ExamDetail = {
  id: string;
  title: string;
  subjectId: string;
  ownerId: string;
  durationMinutes: number;
  startAt: Date | null;
  endAt: Date | null;
  token: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResult: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  subject: { id: string; name: string; code: string };
  owner: { id: string; name: string };
  /** Audit aktor publish/close. Null untuk exam yang dibuat sebelum Fase 9. */
  publishedBy: { id: string; name: string } | null;
  closedBy: { id: string; name: string } | null;
  questionCount: number;
  totalPoints: number;
  questions: ExamQuestionView[];
};

/**
 * Detail memakai satu bentuk respons untuk draft dan non-draft. Draft
 * dimaterialisasi dari soal live; published/closed dari snapshot.
 */
export async function getExamDetailForUser(
  id: string,
  user: ExamScopeUser,
): Promise<ExamDetail | null> {
  const exam = await findExamForUser(id, user);

  if (!exam) {
    return null;
  }

  const questions =
    exam.status === "DRAFT"
      ? await listExamQuestionsWithLiveQuestion(id)
      : await listExamQuestions(id);

  const views = questions.map((question) =>
    toExamQuestionView(
      { ...question, examStatus: exam.status },
      { forStudent: false },
    ),
  );

  const { _count, ...data } = exam;

  return {
    ...data,
    questionCount: _count.questions,
    totalPoints: views.reduce((total, question) => total + question.points, 0),
    questions: views,
  };
}

/**
 * Picker soal memakai endpoint `/api/questions` yang sudah ada. Fungsi ini
 * hanya dipakai bila nanti butuh validasi tambahan di server.
 */
export function examQuestionScopeWhere(
  user: ExamScopeUser,
  examSubjectId: string,
): Prisma.QuestionWhereInput {
  return {
    deletedAt: null,
    subjectId: examSubjectId,
    ...questionScopeWhere(user),
  };
}

export function toExamData(input: ExamInput) {
  return {
    title: input.title,
    subjectId: input.subjectId,
    durationMinutes: input.durationMinutes,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    showResult: input.showResult,
  };
}
