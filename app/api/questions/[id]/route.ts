import { NextResponse } from "next/server";

import { HttpError } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { toStoredOptions } from "@/lib/questions/answers";
import {
  findQuestionForUser,
  questionInclude,
  questionScopeWhere,
  subjectExists,
  toQuestionData,
} from "@/lib/questions/query";
import { questionInputSchema } from "@/lib/zod-schemas/question";

import {
  apiError,
  readJsonBody,
  requireQuestionManager,
  validationError,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireQuestionManager();
    const { id } = await params;
    const question = await findQuestionForUser(id, user);

    if (!question) {
      throw new HttpError(404, "Soal tidak ditemukan");
    }

    return NextResponse.json(question);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireQuestionManager();
    const { id } = await params;

    const existing = await prisma.question.findFirst({
      where: { id, deletedAt: null, ...questionScopeWhere(user) },
      select: { id: true },
    });

    if (!existing) {
      throw new HttpError(404, "Soal tidak ditemukan");
    }

    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = questionInputSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Data soal tidak valid", parsed.error);
    }

    if (!(await subjectExists(parsed.data.subjectId))) {
      throw new HttpError(400, "Mata pelajaran tidak ditemukan");
    }

    /**
     * Opsi selalu diganti utuh. Delete + create dijalankan dalam satu
     * transaksi supaya tidak pernah ada state setengah jadi dan supaya
     * constraint unik (questionId, label) tidak bentrok dengan baris lama.
     */
    const question = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: id } });

      return tx.question.update({
        where: { id },
        data: {
          ...toQuestionData(parsed.data),
          options: { create: toStoredOptions(parsed.data) },
        },
        include: questionInclude,
      });
    });

    return NextResponse.json(question);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireQuestionManager();
    const { id } = await params;

    const existing = await prisma.question.findFirst({
      where: { id, deletedAt: null, ...questionScopeWhere(user) },
      select: { id: true },
    });

    if (!existing) {
      throw new HttpError(404, "Soal tidak ditemukan");
    }

    const question = await prisma.question.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true, deletedAt: true },
    });

    return NextResponse.json(question);
  } catch (error) {
    return apiError(error);
  }
}
