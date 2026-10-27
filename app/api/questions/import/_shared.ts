import type { ImportJob } from "@prisma/client";

import { HttpError } from "@/lib/auth-helpers";
import {
  expireStaleImportJobs,
  findImportJobForUser,
} from "@/lib/importers/jobs";
import {
  parsePreviewPayload,
  previewSummary,
  type PreviewPayload,
} from "@/lib/importers/preview";

export { expireStaleImportJobs };

export async function requireOwnedImportJob(
  id: string,
  userId: string,
): Promise<ImportJob> {
  await expireStaleImportJobs(userId);
  const job = await findImportJobForUser(id, userId);

  if (!job) {
    throw new HttpError(404, "Import job tidak ditemukan");
  }

  return job;
}

export function readJobPreview(job: ImportJob): PreviewPayload | null {
  return parsePreviewPayload(job.previewJson);
}

export function requireJobPreview(job: ImportJob): PreviewPayload {
  const preview = readJobPreview(job);

  if (!preview) {
    throw new HttpError(500, "Preview import tidak dapat dibaca");
  }

  return preview;
}

export function jobSummary(job: ImportJob) {
  const preview = readJobPreview(job);

  return preview
    ? previewSummary(preview)
    : { total: 0, valid: 0, invalid: 0 };
}
