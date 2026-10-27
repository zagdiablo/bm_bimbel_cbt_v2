import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  examScopeWhere,
  getExamDetailForUser,
  toExamData,
} from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";
import { subjectExists } from "@/lib/questions/query";
import { examInputSchema } from "@/lib/zod-schemas/exam";

import {
  apiError,
  readJsonBody,
  requireDraftStatus,
  requireExamManager,
  requireOwnedExam,
  validationError,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireExamManager();
    const { id } = await params;
    const exam = await getExamDetailForUser(id, user);

    if (!exam) {
      throw new HttpError(404, "Ujian tidak ditemukan");
    }

    return NextResponse.json(exam);
  } catch (error) {
    return apiError(error, "api/exams");
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
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

    const parsed = examInputSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Data ujian tidak valid", parsed.error);
    }

    if (!(await subjectExists(parsed.data.subjectId))) {
      throw new HttpError(400, "Mata pelajaran tidak ditemukan");
    }

    if (
      exam.subjectId !== parsed.data.subjectId &&
      exam._count.questions > 0
    ) {
      throw new HttpError(
        400,
        "Kosongkan daftar soal terlebih dahulu sebelum mengganti mata pelajaran",
      );
    }

    const updated = await prisma.exam.updateMany({
      where: {
        id,
        status: "DRAFT",
        ...examScopeWhere(user),
      },
      data: toExamData(parsed.data),
    });

    if (updated.count === 0) {
      throw new HttpError(
        409,
        "Ujian sudah diproses oleh permintaan lain. Muat ulang halaman.",
      );
    }

    const detail = await getExamDetailForUser(id, user);

    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "api/exams");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireExamManager();
    const { id } = await params;
    const exam = await requireOwnedExam(id, user);

    requireDraftStatus(exam.status);

    const deleted = await prisma.exam.deleteMany({
      where: {
        id,
        status: "DRAFT",
        ...examScopeWhere(user),
      },
    });

    if (deleted.count === 0) {
      throw new HttpError(
        409,
        "Ujian sudah diproses oleh permintaan lain. Muat ulang halaman.",
      );
    }

    return NextResponse.json({ id });
  } catch (error) {
    return apiError(error, "api/exams");
  }
}
