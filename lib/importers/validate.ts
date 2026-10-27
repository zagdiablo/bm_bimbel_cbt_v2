import type { ZodError } from "zod";

import {
  questionInputSchema,
  type QuestionInput,
} from "@/lib/zod-schemas/question";

export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "soal";
    return `${path}: ${issue.message}`;
  });
}

/**
 * Validasi terakhir untuk semua parser. Parser boleh menghasilkan data yang
 * terlihat benar, tetapi kontrak `QuestionInput` tetap harus lolos schema
 * discriminated union yang sama dengan API CRUD.
 */
export function validateQuestionCandidate(candidate: unknown): {
  data: QuestionInput | null;
  errors: string[];
} {
  const parsed = questionInputSchema.safeParse(candidate);

  if (!parsed.success) {
    return { data: null, errors: formatZodIssues(parsed.error) };
  }

  return { data: parsed.data, errors: [] };
}

export function normalizeMultilineText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export function parsePipeAnswers(value: string): string[] {
  return value
    .split("|")
    .map((answer) => answer.trim())
    .filter(Boolean);
}

export function parseChoiceLabels(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((label) => label.trim().toUpperCase())
    .filter(Boolean);
}

export function hasDuplicateStrings(
  values: readonly string[],
  caseInsensitive = true,
): boolean {
  const seen = new Set<string>();

  for (const value of values) {
    const key = caseInsensitive ? value.toLowerCase() : value;

    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

export function parseBooleanAnswer(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();

  if (["true", "benar", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "salah", "0"].includes(normalized)) {
    return false;
  }

  return null;
}
