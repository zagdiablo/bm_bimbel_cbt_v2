import { NextResponse } from "next/server";

import {
  buildExportFilename,
  exportCapMessage,
  exportMaxQuestions,
  fileResponse,
  PDF_MIME_TYPE,
  XLSX_MIME_TYPE,
} from "@/lib/exporters/shared";
import { renderQuestionsPdf } from "@/lib/exporters/pdf";
import { renderQuestionsXlsx } from "@/lib/exporters/xlsx";
import { prisma } from "@/lib/prisma";
import {
  countQuestions,
  listQuestionsForExport,
} from "@/lib/questions/query";
import { questionExportQuerySchema } from "@/lib/zod-schemas/question";

import {
  apiError,
  requireQuestionManager,
  validationError,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireQuestionManager();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = questionExportQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter export tidak valid", parsed.error);
    }

    const { format, ...filters } = parsed.data;
    const max = exportMaxQuestions();
    const total = await countQuestions(filters, user);

    if (total > max) {
      return NextResponse.json(
        { message: exportCapMessage(max) },
        { status: 400 },
      );
    }

    const [questions, subject] = await Promise.all([
      listQuestionsForExport(filters, user),
      filters.subjectId
        ? prisma.subject.findUnique({
            where: { id: filters.subjectId },
            select: { name: true, code: true },
          })
        : Promise.resolve(null),
    ]);

    const generatedAt = new Date();
    const filename = buildExportFilename(format, subject?.code, generatedAt);

    if (format === "xlsx") {
      return fileResponse(
        renderQuestionsXlsx(questions),
        XLSX_MIME_TYPE,
        filename,
      );
    }

    const pdf = await renderQuestionsPdf({
      questions,
      userName: user.name,
      subjectName: subject?.name ?? null,
      generatedAt,
    });

    return fileResponse(pdf, PDF_MIME_TYPE, filename);
  } catch (error) {
    return apiError(error);
  }
}
