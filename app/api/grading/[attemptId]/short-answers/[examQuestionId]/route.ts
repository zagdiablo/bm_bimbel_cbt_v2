import { handleScoreUpdate } from "../../../_score";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ attemptId: string; examQuestionId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  return handleScoreUpdate(request, context, "SHORT_ANSWER");
}
