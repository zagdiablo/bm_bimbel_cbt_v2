import { NextResponse } from "next/server";

import { joinAttempt } from "@/lib/attempts/service";
import { nowDate } from "@/lib/attempts/time";
import { joinAttemptSchema } from "@/lib/zod-schemas/attempt";

import {
  apiError,
  readJsonBody,
  requireStudent,
  validationError,
} from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireStudent();
    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = joinAttemptSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Token ujian tidak valid", parsed.error);
    }

    const { attempt, created } = await joinAttempt(
      user.id,
      parsed.data.token,
    );

    const redirectTo =
      attempt.status === "IN_PROGRESS"
        ? `/student/exams/${attempt.examId}/take`
        : `/student/exams/${attempt.examId}/result`;

    return NextResponse.json(
      {
        attemptId: attempt.id,
        examId: attempt.examId,
        status: attempt.status,
        expiresAt: attempt.expiresAt.toISOString(),
        serverNow: nowDate().toISOString(),
        showResult: attempt.exam.showResult,
        redirectTo,
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return apiError(error, "api/attempts/join");
  }
}
