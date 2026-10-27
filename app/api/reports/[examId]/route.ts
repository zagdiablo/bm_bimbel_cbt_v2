import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  getExamForReport,
  getReportSummary,
  listReportAttempts,
  listReportClassrooms,
} from "@/lib/reports/query";
import { reportDetailQuerySchema } from "@/lib/zod-schemas/report";

import { apiError, requireReporter, validationError } from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ examId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireReporter();
    const { examId } = await params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = reportDetailQuerySchema.safeParse(query);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    // Scope dicek lebih dulu: TEACHER yang bukan owner mendapat 404 agar
    // keberadaan exam tidak bocor (konsisten Fase 5/7).
    const exam = await getExamForReport(examId, user);

    if (!exam) {
      throw new HttpError(404, "Ujian tidak ditemukan");
    }

    const [stats, classrooms, attempts] = await Promise.all([
      getReportSummary(examId),
      listReportClassrooms(examId),
      listReportAttempts(examId, parsed.data),
    ]);

    return NextResponse.json({ exam, stats, classrooms, attempts });
  } catch (error) {
    return apiError(error, "api/reports/[examId]");
  }
}
