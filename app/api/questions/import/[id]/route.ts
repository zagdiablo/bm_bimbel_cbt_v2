import { NextResponse } from "next/server";

import { HttpError } from "@/lib/auth-helpers";
import { previewSummary } from "@/lib/importers/preview";
import { deleteImportFile } from "@/lib/importers/storage";
import { prisma } from "@/lib/prisma";

import { apiError, requireQuestionManager } from "../../_shared";
import {
  readJobPreview,
  requireOwnedImportJob,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireQuestionManager();
    const { id } = await params;
    const job = await requireOwnedImportJob(id, user.id);
    const preview = readJobPreview(job);

    if (!preview) {
      throw new HttpError(500, "Preview import tidak dapat dibaca");
    }

    return NextResponse.json({
      id: job.id,
      filename: job.filename,
      fileType: job.fileType,
      fileSize: job.fileSize,
      status: job.status,
      createdAt: job.createdAt,
      committedAt: job.committedAt,
      createdCount: job.createdCount,
      failedCount: job.failedCount,
      summary: previewSummary(preview),
      questions: preview.questions,
      globalErrors: preview.globalErrors,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireQuestionManager();
    const { id } = await params;
    const job = await requireOwnedImportJob(id, user.id);

    if (job.status === "COMMITTED") {
      throw new HttpError(400, "Import job yang sudah commit tidak bisa dihapus");
    }

    await prisma.importJob.delete({ where: { id: job.id } });
    await deleteImportFile(job.id, job.fileType);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
