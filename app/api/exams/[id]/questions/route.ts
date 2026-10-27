import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  examQuestionScopeWhere,
  examScopeWhere,
  getExamDetailForUser,
} from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";
import { examQuestionListSchema } from "@/lib/zod-schemas/exam";

import {
  apiError,
  readJsonBody,
  requireDraftStatus,
  requireExamManager,
  requireOwnedExam,
  validationError,
} from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const user = await requireExamManager();
    const { id } = await params;
    const exam = await requireOwnedExam(id, user);

    requireDraftStatus(exam.status);

    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = examQuestionListSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Daftar soal ujian tidak valid", parsed.error);
    }

    const questionIds = parsed.data.questions.map((item) => item.questionId);

    if (questionIds.length > 0) {
      const available = await prisma.question.findMany({
        where: {
          id: { in: questionIds },
          ...examQuestionScopeWhere(user, exam.subjectId),
        },
        select: { id: true },
      });
      const availableIds = new Set(available.map((question) => question.id));
      const invalidQuestionIds = questionIds.filter(
        (questionId) => !availableIds.has(questionId),
      );

      if (invalidQuestionIds.length > 0) {
        return NextResponse.json(
          {
            message:
              "Sebagian soal tidak tersedia, sudah dihapus, bukan milik Anda, atau bukan dari mata pelajaran ujian",
            invalidQuestionIds,
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.exam.updateMany({
          where: {
            id,
            status: "DRAFT",
            ...examScopeWhere(user),
          },
          data: { updatedAt: new Date() },
        });

        if (locked.count === 0) {
          throw new HttpError(
            409,
            "Ujian sudah diproses oleh permintaan lain. Muat ulang halaman.",
          );
        }

        await tx.examQuestion.deleteMany({ where: { examId: id } });

        if (parsed.data.questions.length > 0) {
          await tx.examQuestion.createMany({
            data: parsed.data.questions.map((item, index) => ({
              examId: id,
              questionId: item.questionId,
              order: index + 1,
              pointsOverride: item.pointsOverride ?? null,
            })),
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    const detail = await getExamDetailForUser(id, user);

    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "api/exams");
  }
}
