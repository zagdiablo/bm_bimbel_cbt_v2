import { NextResponse } from "next/server";

import { listStudentAttempts } from "@/lib/attempts/service";

import { apiError, requireStudent } from "./_shared";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireStudent();
    const result = await listStudentAttempts(user.id);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/attempts");
  }
}
