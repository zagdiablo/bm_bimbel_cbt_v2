import { NextResponse } from "next/server";

import { getAttemptState } from "@/lib/attempts/service";

import { apiError, requireStudent } from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireStudent();
    const { id } = await params;
    const state = await getAttemptState(id, user.id);

    return NextResponse.json(state);
  } catch (error) {
    return apiError(error, "api/attempts/[id]");
  }
}
