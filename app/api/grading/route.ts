import { NextResponse } from "next/server";

import { listPendingGrading } from "@/lib/grading/query";
import { gradingListQuerySchema } from "@/lib/zod-schemas/grading";

import {
  apiError,
  requireGrader,
  validationError,
} from "./_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireGrader();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = gradingListQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    const result = await listPendingGrading(user, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/grading");
  }
}
