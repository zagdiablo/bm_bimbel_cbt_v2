import { NextResponse } from "next/server";

import { saveAttemptAnswer } from "@/lib/attempts/service";
import { answerInputSchema } from "@/lib/zod-schemas/attempt";

import {
  apiError,
  readJsonBody,
  requireStudent,
  validationError,
} from "../../../_shared";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; examQuestionId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireStudent();
    const { id, examQuestionId } = await params;
    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = answerInputSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Jawaban tidak valid", parsed.error);
    }

    const result = await saveAttemptAnswer(
      id,
      user.id,
      examQuestionId,
      parsed.data,
    );

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/attempts/answers");
  }
}
