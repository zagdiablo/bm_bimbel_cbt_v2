import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import { renderResultsPdf } from "@/lib/exporters/report-pdf";
import { renderResultsXlsx } from "@/lib/exporters/report-xlsx";
import {
  buildReportFilename,
  exportMaxAttempts,
  exportMaxPdfAttempts,
  fileResponse,
  PDF_MIME_TYPE,
  reportCapMessage,
  XLSX_MIME_TYPE,
} from "@/lib/exporters/shared";
import {
  getExamForReport,
  getReportSummary,
  countReportAttempts,
  listReportAttemptsForExport,
} from "@/lib/reports/query";
import { reportExportQuerySchema } from "@/lib/zod-schemas/report";

import { apiError, requireReporter, validationError } from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ examId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireReporter();
    const { examId } = await params;
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = reportExportQuerySchema.safeParse(query);

    if (!parsed.success) {
      return validationError("Parameter export tidak valid", parsed.error);
    }

    const exam = await getExamForReport(examId, user);

    if (!exam) {
      throw new HttpError(404, "Ujian tidak ditemukan");
    }

    const { format, ...filters } = parsed.data;
    const max =
      format === "pdf" ? exportMaxPdfAttempts() : exportMaxAttempts();
    const total = await countReportAttempts(examId, filters);

    if (total > max) {
      return NextResponse.json(
        { message: reportCapMessage(format, max) },
        { status: 400 },
      );
    }

    const [attempts, stats] = await Promise.all([
      listReportAttemptsForExport(examId, filters, max),
      getReportSummary(examId),
    ]);
    const generatedAt = new Date();
    const filename = buildReportFilename(format, exam.subject.code, generatedAt);

    if (format === "xlsx") {
      return fileResponse(
        renderResultsXlsx(attempts),
        XLSX_MIME_TYPE,
        filename,
      );
    }

    const pdf = await renderResultsPdf({
      exam,
      stats,
      attempts,
      userName: user.name,
      generatedAt,
    });

    return fileResponse(pdf, PDF_MIME_TYPE, filename);
  } catch (error) {
    return apiError(error, "api/reports/[examId]/export");
  }
}
