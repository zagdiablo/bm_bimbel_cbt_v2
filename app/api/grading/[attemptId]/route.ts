import { NextResponse } from "next/server";

import { getGradingDetail } from "@/lib/grading/query";

import { apiError, requireGrader } from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ attemptId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireGrader();
    const { attemptId } = await params;
    const detail = await getGradingDetail(attemptId, user);

    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "api/grading/[attemptId]");
  }
}
