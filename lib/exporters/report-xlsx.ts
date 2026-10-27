import * as XLSX from "xlsx";

import { formatWib } from "@/lib/exams/datetime";
import { ATTEMPT_STATUS_LABEL } from "@/lib/reports/labels";
import type { ReportAttemptItem } from "@/lib/reports/types";

/**
 * Header laporan hasil ujian. Urutan ini kontrak dengan test Gate 3:
 * `Late` = index 6, `Total` = index 7, `Max` = 8, `Persentase (%)` = 9.
 */
export const RESULT_EXPORT_HEADERS = [
  "No",
  "Nama Siswa",
  "Kelas",
  "Mulai",
  "Submit",
  "Status",
  "Late",
  "Total",
  "Max",
  "Persentase (%)",
  "Graded At",
  "Graded By",
] as const;

export const RESULT_EXPORT_SHEET = "results";

export type ResultExportRow = (string | number)[];

/**
 * Satu baris sheet `results`. Score tetap numerik supaya bisa dihitung ulang
 * di spreadsheet; sel kosong memakai string kosong (bukan "—") agar tidak
 * mengubah tipe kolom.
 */
export function buildResultRow(
  attempt: ReportAttemptItem,
  index: number,
): ResultExportRow {
  return [
    index + 1,
    attempt.student.name,
    attempt.student.classroom ?? "Tanpa Kelas",
    formatWib(attempt.startedAt),
    attempt.submittedAt ? formatWib(attempt.submittedAt) : "",
    ATTEMPT_STATUS_LABEL[attempt.status],
    attempt.submittedAt ? (attempt.isLate ? "Ya" : "Tidak") : "",
    attempt.totalScore ?? "",
    attempt.maxScore,
    attempt.percentage ?? "",
    attempt.gradedAt ? formatWib(attempt.gradedAt) : "",
    attempt.gradedBy?.name ?? "",
  ];
}

export function buildResultRows(
  attempts: readonly ReportAttemptItem[],
): ResultExportRow[] {
  return attempts.map(buildResultRow);
}

export function renderResultsXlsx(
  attempts: readonly ReportAttemptItem[],
): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [...RESULT_EXPORT_HEADERS],
    ...buildResultRows(attempts),
  ]);

  sheet["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 7 },
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, RESULT_EXPORT_SHEET);

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}
