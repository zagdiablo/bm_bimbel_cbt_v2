import type { QuestionExportFormat } from "@/lib/zod-schemas/question";

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_MIME_TYPE = "application/pdf";

/**
 * Batas aman export. Bisa diturunkan lewat env untuk pengujian batas tanpa
 * membuat 2.001 baris di database.
 */
export const DEFAULT_EXPORT_MAX = 2_000;

export const EXPORT_TIME_ZONE = "Asia/Jakarta";

export function exportMaxQuestions(): number {
  const raw = Number(process.env.EXPORT_MAX_QUESTIONS);

  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_EXPORT_MAX;
}

export function exportCapMessage(max = exportMaxQuestions()): string {
  return `Filter terlalu luas, hasil melebihi ${max} soal. Persempit filter.`;
}

function jakartaParts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: EXPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

/** `20261027-112233` — dipakai di nama file agar urut dan bebas spasi. */
export function formatExportTimestamp(date: Date): string {
  const parts = jakartaParts(date);

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

/** `27 Oktober 2026, 11.22 WIB` — dipakai di header PDF. */
export function formatExportDateLong(date: Date): string {
  const formatted = new Intl.DateTimeFormat("id-ID", {
    timeZone: EXPORT_TIME_ZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);

  return `${formatted} WIB`;
}

function subjectSlug(subjectCode: string | null | undefined): string {
  const slug = (subjectCode ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "semua";
}

/** `soal-mtk-20261027-112233.xlsx` (tanpa filter mapel → `soal-semua-...`). */
export function buildExportFilename(
  format: QuestionExportFormat,
  subjectCode: string | null | undefined,
  date: Date,
): string {
  return `soal-${subjectSlug(subjectCode)}-${formatExportTimestamp(date)}.${format}`;
}
