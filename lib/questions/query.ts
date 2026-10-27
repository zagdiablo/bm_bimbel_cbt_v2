import type { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  QuestionInput,
  QuestionListQuery,
} from "@/lib/zod-schemas/question";

export type QuestionScopeUser = { id: string; role: Role };

/** Filter yang dipakai bersama oleh list (berpaginasi) dan export (tanpa pagination). */
export type QuestionFilters = Pick<
  QuestionListQuery,
  "subjectId" | "type" | "difficulty" | "search"
>;

/**
 * ADMIN adalah super-user: melihat seluruh bank soal. TEACHER hanya melihat
 * soal miliknya sendiri. Filter dipakai identik oleh API dan halaman server.
 */
export function questionScopeWhere(
  user: QuestionScopeUser,
): Prisma.QuestionWhereInput {
  return user.role === "TEACHER" ? { ownerId: user.id } : {};
}

export function buildQuestionWhere(
  query: QuestionFilters,
  user: QuestionScopeUser,
): Prisma.QuestionWhereInput {
  const filters: Prisma.QuestionWhereInput[] = [
    { deletedAt: null },
    questionScopeWhere(user),
  ];

  if (query.subjectId) {
    filters.push({ subjectId: query.subjectId });
  }

  if (query.type) {
    filters.push({ type: query.type });
  }

  if (query.difficulty) {
    filters.push({ difficulty: query.difficulty });
  }

  if (query.search) {
    filters.push({
      OR: [
        { questionText: { contains: query.search, mode: "insensitive" } },
        { explanation: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }

  return { AND: filters };
}

export const questionInclude = {
  subject: { select: { id: true, name: true, code: true } },
  options: {
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      text: true,
      isCorrect: true,
      order: true,
    },
  },
} satisfies Prisma.QuestionInclude;

export type QuestionListItem = Prisma.QuestionGetPayload<{
  include: typeof questionInclude;
}>;

export async function listQuestions(
  query: QuestionListQuery,
  user: QuestionScopeUser,
) {
  const where = buildQuestionWhere(query, user);
  const { page, pageSize } = query;

  const [items, total] = await prisma.$transaction([
    prisma.question.findMany({
      where,
      include: questionInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.question.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function findQuestionForUser(
  id: string,
  user: QuestionScopeUser,
) {
  return prisma.question.findFirst({
    where: {
      id,
      deletedAt: null,
      ...questionScopeWhere(user),
    },
    include: questionInclude,
  });
}

/**
 * Export tidak memakai pagination. Hitung dulu supaya route bisa menolak
 * filter yang terlalu luas sebelum menarik ribuan baris dari database.
 */
export async function countQuestions(
  query: QuestionFilters,
  user: QuestionScopeUser,
): Promise<number> {
  return prisma.question.count({ where: buildQuestionWhere(query, user) });
}

export async function listQuestionsForExport(
  query: QuestionFilters,
  user: QuestionScopeUser,
): Promise<QuestionListItem[]> {
  return prisma.question.findMany({
    where: buildQuestionWhere(query, user),
    include: questionInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

/**
 * Memetakan input tervalidasi ke kolom `Question`. `explanation` kosong
 * disimpan sebagai NULL agar filter/pencarian konsisten.
 */
export function toQuestionData(input: QuestionInput) {
  return {
    subjectId: input.subjectId,
    type: input.type,
    questionText: input.questionText,
    explanation: input.explanation?.trim() ? input.explanation.trim() : null,
    difficulty: input.difficulty,
    points: input.points,
  };
}

/**
 * Data-access subject pindah ke `lib/subjects/query.ts` sejak Fase 10.
 * Re-export dipertahankan agar 20+ import lama (dropdown soal/ujian/report)
 * tidak perlu diubah dan tidak regress.
 */
export {
  listSubjects,
  subjectExists,
  subjectSelect,
  type SubjectOption,
} from "@/lib/subjects/query";
