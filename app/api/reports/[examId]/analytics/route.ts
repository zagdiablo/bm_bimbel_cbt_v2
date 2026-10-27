import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  filterAnalyticsItems,
} from "@/lib/analytics/stats";
import { getExamAnalytics } from "@/lib/analytics/query";
import { getExamForReport } from "@/lib/reports/query";
import { analyticsQuerySchema } from "@/lib/zod-schemas/analytics";

import { apiError, requireReporter, validationError } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ examId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireReporter();
    const { examId } = await params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = analyticsQuerySchema.safeParse(query);

    if (!parsed.success) {
      return validationError("Parameter analisis tidak valid", parsed.error);
    }

    // Scope dicek lebih dulu: TEACHER non-owner mendapat 404.
    const exam = await getExamForReport(examId, user);

    if (!exam) {
      throw new HttpError(404, "Ujian tidak ditemukan");
    }

    const analytics = await getExamAnalytics(examId);
    const items = filterAnalyticsItems(analytics.items, parsed.data);

    return NextResponse.json({
      exam,
      summary: analytics.summary,
      items,
    });
  } catch (error) {
    return apiError(error, "api/reports/[examId]/analytics");
  }
}
