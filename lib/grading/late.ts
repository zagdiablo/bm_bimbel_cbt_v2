import { LATE_SUBMISSION_THRESHOLD_MS } from "./constants";

/**
 * Submit dianggap terlambat bila selisih `receivedAt - submittedAt` melewati
 * toleransi jaringan. Attempt yang belum submit (`submittedAt`/`receivedAt`
 * null) tidak pernah dianggap terlambat.
 *
 * Satu definisi dipakai oleh daftar penilaian (Fase 7) dan laporan (Fase 8)
 * supaya badge "Terlambat" konsisten di kedua layar.
 */
export function isLateSubmission(
  submittedAt: Date | null,
  receivedAt: Date | null,
  thresholdMs: number = LATE_SUBMISSION_THRESHOLD_MS,
): boolean {
  if (!submittedAt || !receivedAt) {
    return false;
  }

  return receivedAt.getTime() - submittedAt.getTime() > thresholdMs;
}
