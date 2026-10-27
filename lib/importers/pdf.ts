import {
  InvalidPDFException,
  PasswordException,
  PDFParse,
} from "pdf-parse";

import { parseBlocks } from "./blocks";
import {
  emptyParseResult,
  type ParseResult,
  type SubjectLookup,
} from "./types";

const MIN_PDF_TEXT_LENGTH = 50;

function stripPageMarkers(text: string): string {
  return text.replace(/^-- \d+ of \d+ --$/gm, "").trim();
}

export async function parsePdf(
  buffer: Buffer,
  subjects: SubjectLookup,
): Promise<ParseResult> {
  let parser: PDFParse | undefined;

  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    // `result.pages` tidak menyertakan footer "-- n of m --" yang ada di
    // result.text pada pdf-parse v2.
    const text = stripPageMarkers(
      result.pages.map((page) => page.text).join("\n\n"),
    );

    if (text.length < MIN_PDF_TEXT_LENGTH) {
      return emptyParseResult(
        "PDF tidak berisi teks, mungkin hasil scan. Gunakan PDF text-based.",
      );
    }

    return parseBlocks(text, subjects);
  } catch (error) {
    if (error instanceof PasswordException) {
      return emptyParseResult("PDF terkunci atau membutuhkan password");
    }

    if (error instanceof InvalidPDFException) {
      return emptyParseResult("File PDF tidak valid atau rusak");
    }

    console.error("[importers/pdf]", error);
    return emptyParseResult(
      "Gagal membaca PDF. Pastikan file text-based dan tidak rusak.",
    );
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (error) {
        console.error("[importers/pdf] gagal destroy parser", error);
      }
    }
  }
}
