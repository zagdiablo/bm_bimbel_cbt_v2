import { NextResponse } from "next/server";

import { listReportExams } from "@/lib/reports/query";
import { reportListQuerySchema } from "@/lib/zod-schemas/report";

import { apiError, requireReporter, validationError } from "./_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireReporter();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = reportListQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    const result = await listReportExams(parsed.data, user);

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "api/reports");
  }
}
