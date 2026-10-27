import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  getExamDetailForUser,
  listExams,
  toExamData,
} from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";
import { subjectExists } from "@/lib/questions/query";
import {
  examInputSchema,
  examListQuerySchema,
} from "@/lib/zod-schemas/exam";

import {
  apiError,
  readJsonBody,
  requireExamManager,
  validationError,
} from "./_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireExamManager();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = examListQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    const result = await listExams(parsed.data, user);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/exams");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireExamManager();
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

    const exam = await prisma.exam.create({
      data: {
        ...toExamData(parsed.data),
        ownerId: user.id,
      },
      select: { id: true },
    });

    const detail = await getExamDetailForUser(exam.id, user);

    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return apiError(error, "api/exams");
  }
}
