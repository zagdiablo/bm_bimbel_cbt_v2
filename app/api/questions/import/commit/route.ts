import { NextResponse } from "next/server";
import { z } from "zod";

import { HttpError } from "@/lib/auth-helpers";
import { deleteImportFile } from "@/lib/importers/storage";
import { previewSummary } from "@/lib/importers/preview";
import { prisma } from "@/lib/prisma";
import { toStoredOptions } from "@/lib/questions/answers";
import { toQuestionData } from "@/lib/questions/query";
import {
  questionInputSchema,
  type QuestionInput,
} from "@/lib/zod-schemas/question";

import {
  apiError,
  readJsonBody,
  requireQuestionManager,
  validationError,
} from "../../_shared";
import {
  requireJobPreview,
  requireOwnedImportJob,
} from "../_shared";

export const runtime = "nodejs";

const commitSchema = z.object({
  importJobId: z.string().trim().min(1, "importJobId wajib diisi"),
});

export async function POST(request: Request) {
  try {
    const user = await requireQuestionManager();
    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsedBody = commitSchema.safeParse(payload.body);

    if (!parsedBody.success) {
      return validationError("Body commit tidak valid", parsedBody.error);
    }

    const job = await requireOwnedImportJob(
      parsedBody.data.importJobId,
      user.id,
    );

    if (job.status === "COMMITTED") {
      throw new HttpError(400, "Import job sudah diproses");
    }

    if (job.status === "EXPIRED") {
      throw new HttpError(400, "Import job sudah kedaluwarsa");
    }

    if (job.status === "FAILED") {
      throw new HttpError(
        400,
        "Import job gagal dan tidak bisa di-commit",
      );
    }

    const preview = requireJobPreview(job);
    const summary = previewSummary(preview);

    if (
      preview.globalErrors.length > 0 ||
      summary.total === 0 ||
      summary.invalid > 0 ||
      summary.valid !== summary.total
    ) {
      return NextResponse.json(
        {
          message:
            "Tidak bisa commit: masih ada baris invalid. Perbaiki file lalu upload ulang.",
          summary,
          globalErrors: preview.globalErrors,
        },
        { status: 400 },
      );
    }

    const inputs: QuestionInput[] = [];

    for (const item of preview.questions) {
      if (!item.data || item.errors.length > 0) {
        return NextResponse.json(
          {
            message: `Baris ${item.rowNumber} masih invalid`,
            summary,
          },
          { status: 400 },
        );
      }

      const parsed = questionInputSchema.safeParse(item.data);

      if (!parsed.success) {
        return validationError(
          `Data baris ${item.rowNumber} tidak valid`,
          parsed.error,
        );
      }

      inputs.push(parsed.data);
    }

    if (inputs.length === 0) {
      throw new HttpError(400, "Tidak ada soal valid untuk di-commit");
    }

    const subjectIds = [...new Set(inputs.map((input) => input.subjectId))];
    const foundSubjectCount = await prisma.subject.count({
      where: { id: { in: subjectIds } },
    });

    if (foundSubjectCount !== subjectIds.length) {
      throw new HttpError(400, "Ada mata pelajaran yang sudah tidak tersedia");
    }

    const committedAt = new Date();

    /**
     * Claim status lebih dulu di dalam transaksi. Request commit kedua akan
     * menunggu row lock, lalu melihat status sudah COMMITTED dan gagal di
     * `claimed.count !== 1`. Semua pembuatan soal tetap atomik.
     */
    await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.importJob.updateMany({
          where: {
            id: job.id,
            userId: user.id,
            status: "PENDING_PREVIEW",
          },
          data: { status: "COMMITTED" },
        });

        if (claimed.count !== 1) {
          throw new HttpError(400, "Import job sudah diproses");
        }

        const subjectsStillExist = await tx.subject.count({
          where: { id: { in: subjectIds } },
        });

        if (subjectsStillExist !== subjectIds.length) {
          throw new HttpError(
            400,
            "Ada mata pelajaran yang sudah tidak tersedia",
          );
        }

        for (const input of inputs) {
          await tx.question.create({
            data: {
              ...toQuestionData(input),
              ownerId: user.id,
              options: { create: toStoredOptions(input) },
            },
          });
        }

        await tx.importJob.update({
          where: { id: job.id },
          data: {
            createdCount: inputs.length,
            failedCount: 0,
            committedAt,
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await deleteImportFile(job.id, job.fileType);

    return NextResponse.json({
      importJobId: job.id,
      status: "COMMITTED",
      createdCount: inputs.length,
      failedCount: 0,
      summary,
    });
  } catch (error) {
    return apiError(error);
  }
}
