import { NextResponse } from "next/server";

import {
  saveQuestionScore,
  type ScoringMode,
} from "@/lib/grading/service";
import { questionScoreInputSchema } from "@/lib/zod-schemas/grading";

import {
  apiError,
  readJsonBody,
  requireGrader,
  validationError,
} from "./_shared";

type ScoreRouteContext = {
  params: Promise<{ attemptId: string; examQuestionId: string }>;
};

export async function handleScoreUpdate(
  request: Request,
  { params }: ScoreRouteContext,
  mode: ScoringMode,
) {
  try {
    const user = await requireGrader();
    const { attemptId, examQuestionId } = await params;
    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = questionScoreInputSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Nilai tidak valid", parsed.error);
    }

    const detail = await saveQuestionScore(
      attemptId,
      examQuestionId,
      parsed.data,
      user,
      mode,
    );

    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "api/grading/score");
  }
}
