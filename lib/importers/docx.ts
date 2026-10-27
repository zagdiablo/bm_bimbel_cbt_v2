import mammoth from "mammoth";

import { parseBlocks } from "./blocks";
import {
  emptyParseResult,
  type ParseResult,
  type SubjectLookup,
} from "./types";

export async function parseDocx(
  buffer: Buffer,
  subjects: SubjectLookup,
): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return parseBlocks(result.value, subjects);
  } catch (error) {
    console.error("[importers/docx]", error);
    return emptyParseResult("File DOCX tidak valid atau rusak");
  }
}
