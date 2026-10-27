import { NextResponse } from "next/server";

import { HttpError } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { toStoredOptions } from "@/lib/questions/answers";
import {
  listQuestions,
  subjectExists,
  toQuestionData,
  questionInclude,
} from "@/lib/questions/query";
import { questionInputSchema, questionListQuerySchema } from "@/lib/zod-schemas/question";

import {
  apiError,
  readJsonBody,
  requireQuestionManager,
  validationError,
} from "./_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireQuestionManager();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = questionListQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    const result = await listQuestions(parsed.data, user);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireQuestionManager();
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

    const question = await prisma.question.create({
      data: {
        ...toQuestionData(parsed.data),
        ownerId: user.id,
        options: { create: toStoredOptions(parsed.data) },
      },
      include: questionInclude,
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
