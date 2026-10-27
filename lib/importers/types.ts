import type { QuestionInput } from "@/lib/zod-schemas/question";

export type ImportFileTypeValue = "XLSX" | "DOCX" | "PDF";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_QUESTIONS = 1_000;
export const MAX_EXTRACTED_TEXT_CHARS = 2_000_000;
export const IMPORT_TTL_MS = 60 * 60 * 1_000;

export type ParsedQuestion = {
  rowNumber: number;
  data: QuestionInput | null;
  errors: string[];
};

export type ParseResult = {
  questions: ParsedQuestion[];
  globalErrors: string[];
};

export type SubjectLookup = {
  /** Kode mapel lowercase → id mapel. */
  byCode: Map<string, string>;
  /** Dipakai DOCX/PDF karena format blok tidak membawa kode mapel. */
  defaultSubjectId?: string;
};

export type ImportSummary = {
  total: number;
  valid: number;
  invalid: number;
};

export function summarizeQuestions(
  questions: readonly ParsedQuestion[],
): ImportSummary {
  const valid = questions.filter(
    (question) => question.data !== null && question.errors.length === 0,
  ).length;

  return {
    total: questions.length,
    valid,
    invalid: questions.length - valid,
  };
}

export function emptyParseResult(message: string): ParseResult {
  return { questions: [], globalErrors: [message] };
}
