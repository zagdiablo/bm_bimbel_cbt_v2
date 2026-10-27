import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";
import {
  emptyParseResult,
  type ImportFileTypeValue,
  type ParseResult,
  type SubjectLookup,
} from "./types";
import { parseXlsx } from "./xlsx";

export async function parseFile(
  fileType: ImportFileTypeValue,
  buffer: Buffer,
  subjects: SubjectLookup,
): Promise<ParseResult> {
  try {
    switch (fileType) {
      case "XLSX":
        return parseXlsx(buffer, subjects);
      case "DOCX":
        return parseDocx(buffer, subjects);
      case "PDF":
        return parsePdf(buffer, subjects);
    }
  } catch (error) {
    console.error("[importers] parseFile", error);
    return emptyParseResult(
      "Gagal membaca file. Periksa format dan isi file.",
    );
  }
}

export type {
  ImportFileTypeValue,
  ImportSummary,
  ParseResult,
  ParsedQuestion,
  SubjectLookup,
} from "./types";
export {
  IMPORT_TTL_MS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_QUESTIONS,
  summarizeQuestions,
} from "./types";
