import {
  attemptIntegrityError,
  type AttemptIntegrityContext,
} from "@/lib/attempts/payload";
import { parseExamSnapshot } from "@/lib/exams/snapshot";
import type { ExamSnapshot } from "@/lib/zod-schemas/exam";

/**
 * Grading tidak pernah membaca soal live. Snapshot wajib ada dan valid;
 * kalau tidak, kirim 500 eksplisit dengan examQuestionId agar guru/admin bisa
 * menelusuri data yang rusak.
 */
export function parseGradingSnapshot(
  snapshotJson: unknown,
  context: AttemptIntegrityContext,
): ExamSnapshot {
  if (snapshotJson === null || snapshotJson === undefined) {
    throw attemptIntegrityError(
      "snapshot soal tidak tersedia",
      context,
    );
  }

  try {
    return parseExamSnapshot(snapshotJson);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "format snapshot tidak valid";

    throw attemptIntegrityError(
      `snapshot soal tidak valid: ${detail}`,
      context,
    );
  }
}
