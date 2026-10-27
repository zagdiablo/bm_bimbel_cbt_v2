import type { ImportFileType, ImportStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { deleteImportFile } from "./storage";
import { IMPORT_TTL_MS } from "./types";

export type ImportJobListItem = {
  id: string;
  filename: string;
  fileType: ImportFileType;
  status: ImportStatus;
  createdCount: number;
  failedCount: number;
  createdAt: Date;
  committedAt: Date | null;
};

export async function expireStaleImportJobs(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - IMPORT_TTL_MS);
  const stale = await prisma.importJob.findMany({
    where: {
      userId,
      status: "PENDING_PREVIEW",
      createdAt: { lt: cutoff },
    },
    select: { id: true, fileType: true },
  });

  if (stale.length === 0) {
    return;
  }

  await prisma.importJob.updateMany({
    where: {
      id: { in: stale.map((job) => job.id) },
      status: "PENDING_PREVIEW",
    },
    data: { status: "EXPIRED" },
  });

  await Promise.all(
    stale.map((job) => deleteImportFile(job.id, job.fileType)),
  );
}

export async function findImportJobForUser(id: string, userId: string) {
  return prisma.importJob.findFirst({
    where: { id, userId },
  });
}

export async function listRecentImportJobs(
  userId: string,
  take = 10,
): Promise<ImportJobListItem[]> {
  await expireStaleImportJobs(userId);

  return prisma.importJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      filename: true,
      fileType: true,
      status: true,
      createdCount: true,
      failedCount: true,
      createdAt: true,
      committedAt: true,
    },
  });
}
