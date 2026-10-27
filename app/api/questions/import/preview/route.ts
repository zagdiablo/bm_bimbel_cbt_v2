import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { HttpError } from "@/lib/auth-helpers";
import { parseFile } from "@/lib/importers";
import {
  buildPreviewPayload,
  serializePreviewForPrisma,
} from "@/lib/importers/preview";
import {
  saveImportFile,
  sanitizeFilename,
  validateImportUpload,
} from "@/lib/importers/storage";
import {
  MAX_IMPORT_FILE_BYTES,
  summarizeQuestions,
} from "@/lib/importers/types";
import { prisma } from "@/lib/prisma";

import { apiError, requireQuestionManager } from "../../_shared";

export const runtime = "nodejs";

const MAX_MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireQuestionManager();
    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_IMPORT_FILE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
    ) {
      return NextResponse.json(
        { message: "Ukuran file maksimal 10MB" },
        { status: 413 },
      );
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return NextResponse.json(
        { message: "Body request harus berupa multipart/form-data" },
        { status: 400 },
      );
    }

    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { message: "File soal wajib diunggah" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const validation = validateImportUpload(fileEntry, buffer);

    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message },
        { status: validation.status },
      );
    }

    const { fileType } = validation;
    const subjectIdRaw = formData.get("subjectId");
    const subjectId =
      typeof subjectIdRaw === "string" && subjectIdRaw.trim()
        ? subjectIdRaw.trim()
        : undefined;

    const defaultSubjectId = fileType === "XLSX" ? undefined : subjectId;

    if (fileType !== "XLSX" && !defaultSubjectId) {
      return NextResponse.json(
        {
          message:
            "Mata pelajaran wajib dipilih untuk import DOCX/PDF",
        },
        { status: 400 },
      );
    }

    if (defaultSubjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: defaultSubjectId },
        select: { id: true },
      });

      if (!subject) {
        throw new HttpError(400, "Mata pelajaran tidak ditemukan");
      }
    }

    const subjectRows = await prisma.subject.findMany({
      select: { id: true, code: true },
    });
    const byCode = new Map(
      subjectRows.map((subject) => [
        subject.code.trim().toLowerCase(),
        subject.id,
      ]),
    );

    const job = await prisma.importJob.create({
      data: {
        userId: user.id,
        filename: sanitizeFilename(fileEntry.name || "import"),
        fileType,
        fileSize: fileEntry.size,
      },
    });

    try {
      await saveImportFile(job.id, fileType, buffer);
    } catch (error) {
      console.error("[api/questions/import/preview] simpan file", error);
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorJson: {
            globalErrors: ["Gagal menyimpan file upload"],
          } as Prisma.InputJsonValue,
        },
      });

      throw new HttpError(500, "Gagal menyimpan file upload");
    }

    const result = await parseFile(fileType, buffer, {
      byCode,
      defaultSubjectId,
    });
    const summary = summarizeQuestions(result.questions);
    const failed = result.questions.length === 0 && result.globalErrors.length > 0;
    const status = failed ? "FAILED" : "PENDING_PREVIEW";
    const preview = buildPreviewPayload({
      filename: job.filename,
      fileType,
      defaultSubjectId,
      questions: result.questions,
      globalErrors: result.globalErrors,
    });

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        previewJson: serializePreviewForPrisma(
          preview,
        ) as Prisma.InputJsonValue,
        failedCount: summary.invalid,
        ...(failed
          ? {
              errorJson: {
                globalErrors: result.globalErrors,
              } as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    return NextResponse.json({
      importJobId: job.id,
      status,
      filename: job.filename,
      fileType,
      summary,
      questions: result.questions,
      globalErrors: result.globalErrors,
    });
  } catch (error) {
    return apiError(error);
  }
}
