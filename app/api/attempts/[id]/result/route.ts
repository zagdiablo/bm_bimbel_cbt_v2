import { NextResponse } from "next/server";

import { getAttemptResult } from "@/lib/attempts/service";

import { apiError, requireStudent } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireStudent();
    const { id } = await params;
    const result = await getAttemptResult(id, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/attempts/result");
  }
}
