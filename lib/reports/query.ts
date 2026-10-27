import type { Prisma } from "@prisma/client";

import type { AuthUser } from "@/lib/auth-helpers";
import { examScopeWhere } from "@/lib/exams/query";
import { isLateSubmission } from "@/lib/grading/late";
import { prisma } from "@/lib/prisma";
import { subjectSelect } from "@/lib/questions/query";

import { REPORT_NO_CLASSROOM } from "./labels";
import {
  attemptPercentage,
  buildHistogram,
  histogramTotal,
  roundPercentage,
  roundScore,
} from "./stats";
import type {
  ReportAttemptFilters,
  ReportAttemptItem,
  ReportAttemptList,
  ReportDetailQuery,
  ReportExam,
  ReportExamItem,
  ReportListQuery,
  ReportSummary,
} from "./types";

/** Urutan deterministik: nama siswa A→Z, `id` sebagai tiebreak. */
const REPORT_ATTEMPT_ORDER: Prisma.AttemptOrderByWithRelationInput[] = [
  { student: { name: "asc" } },
  { id: "asc" },
];

const reportAttemptSelect = {
  id: true,
  status: true,
  startedAt: true,
  submittedAt: true,
  receivedAt: true,
  gradedAt: true,
  totalScore: true,
  maxScore: true,
  student: { select: { id: true, name: true, classroom: true } },
  gradedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttemptSelect;

type ReportAttemptRow = Prisma.AttemptGetPayload<{
  select: typeof reportAttemptSelect;
}>;

function buildReportExamWhere(
  query: Omit<ReportListQuery, "page" | "pageSize">,
  user: AuthUser,
): Prisma.ExamWhereInput {
  const filters: Prisma.ExamWhereInput[] = [
    examScopeWhere(user),
    // Exam tanpa attempt tidak relevan untuk laporan.
    { attempts: { some: {} } },
  ];

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

/** List exam yang punya minimal satu attempt, lengkap dengan counter per status. */
export async function listReportExams(
  query: ReportListQuery,
  user: AuthUser,
): Promise<{
  items: ReportExamItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where = buildReportExamWhere(query, user);
  const { page, pageSize } = query;

  const [exams, total] = await prisma.$transaction([
    prisma.exam.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        startAt: true,
        endAt: true,
        subject: { select: subjectSelect },
        _count: { select: { attempts: true } },
      },
      orderBy: [
        { startAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exam.count({ where }),
  ]);

  const examIds = exams.map((exam) => exam.id);
  const grouped =
    examIds.length > 0
      ? await prisma.attempt.groupBy({
          by: ["examId", "status"],
          where: { examId: { in: examIds } },
          _count: { _all: true },
          _avg: { totalScore: true },
          _max: { maxScore: true },
        })
      : [];

  const items = exams.map((exam) => {
    const rows = grouped.filter((row) => row.examId === exam.id);
    const graded = rows.find((row) => row.status === "GRADED");
    const countFor = (status: "IN_PROGRESS" | "SUBMITTED" | "GRADED") =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    const item: ReportExamItem = {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      status: exam.status,
      startAt: exam.startAt?.toISOString() ?? null,
      endAt: exam.endAt?.toISOString() ?? null,
      counts: {
        total: exam._count.attempts,
        inProgress: countFor("IN_PROGRESS"),
        submitted: countFor("SUBMITTED"),
        graded: countFor("GRADED"),
      },
      avgScore: roundScore(graded?._avg.totalScore ?? null),
      maxScore: graded?._max.maxScore ?? null,
    };

    return item;
  });

  return { items, total, page, pageSize };
}

/** Exam + metadata untuk header laporan; null bila di luar scope user. */
export async function getExamForReport(
  examId: string,
  user: AuthUser,
): Promise<ReportExam | null> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, ...examScopeWhere(user) },
    select: {
      id: true,
      title: true,
      status: true,
      startAt: true,
      endAt: true,
      durationMinutes: true,
      token: true,
      showResult: true,
      publishedAt: true,
      closedAt: true,
      subject: { select: subjectSelect },
      owner: { select: { id: true, name: true } },
    },
  });

  if (!exam) {
    return null;
  }

  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject,
    owner: exam.owner,
    status: exam.status,
    startAt: exam.startAt?.toISOString() ?? null,
    endAt: exam.endAt?.toISOString() ?? null,
    durationMinutes: exam.durationMinutes,
    token: exam.token,
    showResult: exam.showResult,
    publishedAt: exam.publishedAt?.toISOString() ?? null,
    closedAt: exam.closedAt?.toISOString() ?? null,
  };
}

type HistogramRow = { bin: number; count: number };

/**
 * Agregasi ringkasan dalam dua query SQL:
 * 1. `groupBy` status → counter + avg/min/max (hanya GRADED dipakai).
 * 2. `$queryRaw` → histogram 5 bin. Bin dihitung di database, bukan loop
 *    per-attempt di JS.
 */
export async function getReportSummary(examId: string): Promise<ReportSummary> {
  const [groups, histogramRows] = await Promise.all([
    prisma.attempt.groupBy({
      by: ["status"],
      where: { examId },
      _count: { _all: true },
      _avg: { totalScore: true },
      _min: { totalScore: true },
      _max: { totalScore: true, maxScore: true },
    }),
    prisma.$queryRaw<HistogramRow[]>`
      SELECT LEAST(4, GREATEST(0,
               CEIL(("totalScore"::numeric * 5 / "maxScore"))::int - 1)) + 1 AS bin,
             COUNT(*)::int AS count
      FROM attempts
      WHERE "examId" = ${examId}
        AND status = 'GRADED'::"AttemptStatus"
        AND "totalScore" IS NOT NULL
        AND "maxScore" > 0
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const countFor = (status: "IN_PROGRESS" | "SUBMITTED" | "GRADED") =>
    groups.find((group) => group.status === status)?._count._all ?? 0;

  const gradedGroup = groups.find((group) => group.status === "GRADED");
  const gradedCount = gradedGroup?._count._all ?? 0;
  const avgScore = roundScore(gradedGroup?._avg.totalScore ?? null);
  const gradedMaxScore = gradedGroup?._max.maxScore ?? null;
  const histogram = buildHistogram(histogramRows);
  const total = histogramTotal(histogram);

  return {
    totalAttempts:
      countFor("IN_PROGRESS") + countFor("SUBMITTED") + gradedCount,
    byStatus: {
      inProgress: countFor("IN_PROGRESS"),
      submitted: countFor("SUBMITTED"),
      graded: gradedCount,
    },
    graded: {
      count: gradedCount,
      avgScore,
      minScore: roundScore(gradedGroup?._min.totalScore ?? null),
      maxScore: roundScore(gradedGroup?._max.totalScore ?? null),
      avgPercentage:
        avgScore !== null && gradedMaxScore !== null && gradedMaxScore > 0
          ? roundPercentage((avgScore / gradedMaxScore) * 100)
          : null,
    },
    histogram,
    histogramTotal: total,
    invalidScores: Math.max(0, gradedCount - total),
  };
}

function buildAttemptWhere(
  examId: string,
  filters: ReportAttemptFilters,
): Prisma.AttemptWhereInput {
  const student: Prisma.UserWhereInput = {};
  const classroom = filters.classroom?.trim();

  if (classroom === REPORT_NO_CLASSROOM) {
    student.classroom = null;
  } else if (classroom) {
    student.classroom = classroom;
  }

  if (filters.search) {
    student.name = { contains: filters.search, mode: "insensitive" };
  }

  return {
    examId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(Object.keys(student).length > 0 ? { student: { is: student } } : {}),
  };
}

function toReportAttemptItem(row: ReportAttemptRow): ReportAttemptItem {
  return {
    id: row.id,
    student: row.student,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    gradedAt: row.gradedAt?.toISOString() ?? null,
    gradedBy: row.gradedBy,
    totalScore: row.totalScore,
    maxScore: row.maxScore,
    percentage: attemptPercentage(row.totalScore, row.maxScore),
    isLate: isLateSubmission(row.submittedAt, row.receivedAt),
  };
}

export async function listReportAttempts(
  examId: string,
  query: ReportDetailQuery,
): Promise<ReportAttemptList> {
  const where = buildAttemptWhere(examId, query);
  const { page, pageSize } = query;

  const [rows, total] = await prisma.$transaction([
    prisma.attempt.findMany({
      where,
      select: reportAttemptSelect,
      orderBy: REPORT_ATTEMPT_ORDER,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.attempt.count({ where }),
  ]);

  return {
    items: rows.map(toReportAttemptItem),
    total,
    page,
    pageSize,
  };
}

export async function countReportAttempts(
  examId: string,
  filters: ReportAttemptFilters,
): Promise<number> {
  return prisma.attempt.count({ where: buildAttemptWhere(examId, filters) });
}

/**
 * Baris export memakai filter yang sama dengan tabel, tanpa pagination.
 * `take` dibatasi pemanggil (cap export), urutan deterministik.
 */
export async function listReportAttemptsForExport(
  examId: string,
  filters: ReportAttemptFilters,
  take: number,
): Promise<ReportAttemptItem[]> {
  const rows = await prisma.attempt.findMany({
    where: buildAttemptWhere(examId, filters),
    select: reportAttemptSelect,
    orderBy: REPORT_ATTEMPT_ORDER,
    take,
  });

  return rows.map(toReportAttemptItem);
}

/** Daftar kelas siswa yang punya attempt di exam ini (untuk filter UI). */
export async function listReportClassrooms(
  examId: string,
): Promise<(string | null)[]> {
  const rows = await prisma.user.findMany({
    where: { attempts: { some: { examId } } },
    distinct: ["classroom"],
    select: { classroom: true },
  });

  return rows
    .map((row) => row.classroom)
    .sort((left, right) => {
      if (left === null) return 1;
      if (right === null) return -1;

      return left.localeCompare(right, "id");
    });
}
