import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  examQuestionBaseSelect,
  examScopeWhere,
  getExamDetailForUser,
} from "@/lib/exams/query";
import {
  buildExamSnapshot,
  snapshotAnswerIssues,
  snapshotQuestionSelect,
} from "@/lib/exams/snapshot";
import { generateExamToken } from "@/lib/exams/token";
import { prisma } from "@/lib/prisma";
import { MAX_EXAM_QUESTIONS } from "@/lib/zod-schemas/exam";

import {
  apiError,
  requireDraftStatus,
  requireExamManager,
  requireOwnedExam,
} from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type InvalidQuestion = {
  order: number;
  questionId: string | null;
  reason: string;
};

class PublishValidationError extends Error {
  readonly invalidQuestions: InvalidQuestion[];

  constructor(invalidQuestions: InvalidQuestion[]) {
    super("Ada soal yang tidak valid untuk dipublikasikan");
    this.name = "PublishValidationError";
    this.invalidQuestions = invalidQuestions;
  }
}

const TOKEN_ATTEMPTS = 5;

function isTokenCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireExamManager();
    const { id } = await params;
    const exam = await requireOwnedExam(id, user);

    requireDraftStatus(exam.status);

    const now = new Date();

    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const token = generateExamToken();

            /**
             * Conditional update adalah lock sekaligus penjaga race:
             * dua request publish tidak mungkin sama-sama sukses.
             */
            const published = await tx.exam.updateMany({
              where: {
                id,
                status: "DRAFT",
                ...examScopeWhere(user),
              },
              data: {
                status: "PUBLISHED",
                token,
                publishedAt: now,
                publishedById: user.id,
              },
            });

            if (published.count === 0) {
              throw new HttpError(
                409,
                "Ujian sudah diproses oleh permintaan lain. Muat ulang halaman.",
              );
            }

            const fresh = await tx.exam.findUniqueOrThrow({ where: { id } });

            if (!fresh.startAt || !fresh.endAt) {
              throw new HttpError(
                400,
                "Jadwal mulai dan selesai wajib diisi sebelum publish",
              );
            }

            if (fresh.startAt >= fresh.endAt) {
              throw new HttpError(
                400,
                "Waktu selesai harus setelah waktu mulai",
              );
            }

            if (fresh.endAt.getTime() <= now.getTime()) {
              throw new HttpError(
                400,
                "Waktu selesai ujian sudah lewat. Perbarui jadwal terlebih dahulu",
              );
            }

            if (
              fresh.durationMinutes < 1 ||
              fresh.durationMinutes > 480
            ) {
              throw new HttpError(400, "Durasi ujian harus 1–480 menit");
            }

            const rows = await tx.examQuestion.findMany({
              where: { examId: id },
              orderBy: { order: "asc" },
              select: {
                ...examQuestionBaseSelect,
                question: { select: snapshotQuestionSelect },
              },
            });

            if (rows.length === 0) {
              throw new HttpError(
                400,
                "Ujian harus memiliki minimal 1 soal sebelum dipublikasikan",
              );
            }

            if (rows.length > MAX_EXAM_QUESTIONS) {
              throw new HttpError(
                400,
                `Ujian maksimal berisi ${MAX_EXAM_QUESTIONS} soal`,
              );
            }

            const invalidQuestions: InvalidQuestion[] = [];
            const snapshots: {
              id: string;
              snapshot: ReturnType<typeof buildExamSnapshot>;
            }[] = [];
            const capturedAt = new Date();

            for (const row of rows) {
              if (!row.questionId || !row.question) {
                invalidQuestions.push({
                  order: row.order,
                  questionId: row.questionId,
                  reason: "Soal sudah dihapus dari bank soal",
                });
                continue;
              }

              if (row.question.deletedAt) {
                invalidQuestions.push({
                  order: row.order,
                  questionId: row.questionId,
                  reason: "Soal sudah dihapus dari bank soal",
                });
                continue;
              }

              if (row.question.subjectId !== fresh.subjectId) {
                invalidQuestions.push({
                  order: row.order,
                  questionId: row.questionId,
                  reason: "Soal bukan berasal dari mata pelajaran ujian",
                });
                continue;
              }

              if (
                row.pointsOverride !== null &&
                (row.pointsOverride < 1 || row.pointsOverride > 1_000)
              ) {
                invalidQuestions.push({
                  order: row.order,
                  questionId: row.questionId,
                  reason: "Poin override harus 1–1000",
                });
                continue;
              }

              const snapshot = buildExamSnapshot(row.question, capturedAt);
              const issues = snapshotAnswerIssues(snapshot);

              if (issues.length > 0) {
                invalidQuestions.push({
                  order: row.order,
                  questionId: row.questionId,
                  reason: issues.join("; "),
                });
                continue;
              }

              snapshots.push({ id: row.id, snapshot });
            }

            if (invalidQuestions.length > 0) {
              throw new PublishValidationError(invalidQuestions);
            }

            for (const item of snapshots) {
              await tx.examQuestion.update({
                where: { id: item.id },
                data: {
                  snapshotJson: item.snapshot as Prisma.InputJsonValue,
                },
              });
            }
          },
          { timeout: 30_000, maxWait: 10_000 },
        );

        const detail = await getExamDetailForUser(id, user);

        if (!detail) {
          throw new HttpError(404, "Ujian tidak ditemukan");
        }

        return NextResponse.json(detail);
      } catch (error) {
        if (isTokenCollision(error) && attempt < TOKEN_ATTEMPTS - 1) {
          continue;
        }

        throw error;
      }
    }

    throw new HttpError(
      500,
      "Gagal membuat token unik. Coba publikasikan ulang",
    );
  } catch (error) {
    if (error instanceof PublishValidationError) {
      return NextResponse.json(
        {
          message: error.message,
          invalidQuestions: error.invalidQuestions,
        },
        { status: 400 },
      );
    }

    return apiError(error, "api/exams");
  }
}
