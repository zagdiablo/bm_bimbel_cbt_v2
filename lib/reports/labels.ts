import type { AttemptStatus } from "@prisma/client";

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  IN_PROGRESS: "Sedang berjalan",
  SUBMITTED: "Menunggu penilaian",
  GRADED: "Sudah dinilai",
};

export const REPORT_NO_CLASSROOM_LABEL = "Tanpa Kelas";

/** Sentinel filter untuk attempt milik siswa tanpa kelas (`classroom = null`). */
export const REPORT_NO_CLASSROOM = "__none__";
