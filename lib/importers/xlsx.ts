import * as XLSX from "xlsx";

import {
  difficultySchema,
  questionTypeSchema,
  type DifficultyValue,
  type QuestionOptionInput,
  type QuestionTypeValue,
} from "@/lib/zod-schemas/question";

import {
  emptyParseResult,
  MAX_IMPORT_QUESTIONS,
  type ParseResult,
  type ParsedQuestion,
  type SubjectLookup,
} from "./types";
import {
  hasDuplicateStrings,
  parseBooleanAnswer,
  parseChoiceLabels,
  parsePipeAnswers,
  validateQuestionCandidate,
} from "./validate";

const REQUIRED_HEADERS = [
  "subject_code",
  "type",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct_answers",
  "points",
  "difficulty",
  "explanation",
] as const;

const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

type Row = unknown[];

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function readCell(row: Row, index: number): string {
  return toText(row[index]);
}

function resolveType(value: string): QuestionTypeValue | null {
  const parsed = questionTypeSchema.safeParse(value.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

function resolveDifficulty(value: string): DifficultyValue | null {
  const parsed = difficultySchema.safeParse(
    (value || "MEDIUM").trim().toUpperCase(),
  );
  return parsed.success ? parsed.data : null;
}

function parseRow(
  row: Row,
  rowNumber: number,
  header: Map<string, number>,
  subjects: SubjectLookup,
): ParsedQuestion {
  const errors: string[] = [];
  const get = (name: string) =>
    readCell(row, header.get(name) ?? -1);

  const subjectCode = get("subject_code").toLowerCase();
  const subjectId = subjectCode ? subjects.byCode.get(subjectCode) : undefined;

  if (!subjectCode) {
    errors.push("subject_code wajib diisi");
  } else if (!subjectId) {
    errors.push(`Kode mapel "${get("subject_code")}" tidak ditemukan`);
  }

  const typeRaw = get("type");
  const type = resolveType(typeRaw);

  if (!typeRaw) {
    errors.push("type wajib diisi");
  } else if (!type) {
    errors.push(`type "${typeRaw}" tidak dikenal`);
  }

  if (!type) {
    return { rowNumber, data: null, errors };
  }

  const questionText = get("question");

  if (!questionText) {
    errors.push("question wajib diisi");
  }

  const difficultyRaw = get("difficulty");
  const difficulty = resolveDifficulty(difficultyRaw);

  if (!difficulty) {
    errors.push("difficulty harus EASY, MEDIUM, atau HARD");
  }

  const pointsRaw = get("points");
  const points = pointsRaw ? Number(pointsRaw) : 1;

  if (!Number.isFinite(points)) {
    errors.push("points harus berupa angka");
  }

  const optionTexts = OPTION_LETTERS.map((label, index) => ({
    label,
    text: get(`option_${String.fromCharCode(97 + index)}`),
  }));

  const nonEmptyOptions = optionTexts.filter((option) => option.text);

  for (let index = 0; index < nonEmptyOptions.length; index += 1) {
    if (!optionTexts[index]?.text) {
      errors.push("Opsi harus diisi berurutan mulai dari A");
      break;
    }
  }

  const options: QuestionOptionInput[] = nonEmptyOptions.map((option) => ({
    label: option.label,
    text: option.text,
    isCorrect: false,
  }));

  if (hasDuplicateStrings(options.map((option) => option.label), false)) {
    errors.push("Label opsi tidak boleh duplikat");
  }

  const correctRaw = get("correct_answers");
  const explanation = get("explanation");
  const base = {
    ...(subjectId ? { subjectId } : {}),
    questionText,
    ...(explanation ? { explanation } : {}),
    difficulty,
    points,
  };
  let candidate: Record<string, unknown> | null = null;

  switch (type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      if (options.length < 2) {
        errors.push("Minimal 2 opsi jawaban");
      }

      const labels = parseChoiceLabels(correctRaw);

      if (labels.length === 0) {
        errors.push("correct_answers wajib diisi");
      }

      if (hasDuplicateStrings(labels, false)) {
        errors.push("correct_answers tidak boleh duplikat");
      }

      const availableLabels = new Set(options.map((option) => option.label));

      for (const label of labels) {
        if (!availableLabels.has(label)) {
          errors.push(`Label jawaban ${label} tidak ada di opsi`);
        }
      }

      if (type === "SINGLE_CHOICE" && labels.length !== 1) {
        errors.push("SINGLE_CHOICE harus punya tepat 1 jawaban");
      }

      if (type === "MULTIPLE_CHOICE" && labels.length < 1) {
        errors.push("MULTIPLE_CHOICE minimal punya 1 jawaban");
      }

      candidate = {
        ...base,
        type,
        options: options.map((option) => ({
          ...option,
          isCorrect: labels.includes(option.label),
        })),
      };
      break;
    }

    case "TRUE_FALSE": {
      if (options.length > 0) {
        errors.push("TRUE_FALSE tidak memakai kolom opsi");
      }

      const correctAnswer = parseBooleanAnswer(correctRaw);

      if (correctAnswer === null) {
        errors.push("correct_answers TRUE_FALSE harus true/false");
      }

      candidate = { ...base, type, correctAnswer };
      break;
    }

    case "SHORT_ANSWER": {
      if (options.length > 0) {
        errors.push("SHORT_ANSWER tidak memakai kolom opsi");
      }

      const answers = parsePipeAnswers(correctRaw);

      if (answers.length === 0) {
        errors.push("correct_answers SHORT_ANSWER wajib diisi");
      }

      if (hasDuplicateStrings(answers)) {
        errors.push("Jawaban benar tidak boleh duplikat");
      }

      candidate = { ...base, type, correctAnswers: answers };
      break;
    }

    case "ESSAY": {
      if (options.length > 0) {
        errors.push("ESSAY tidak memakai kolom opsi");
      }

      if (correctRaw) {
        errors.push("ESSAY tidak memakai correct_answers");
      }

      candidate = { ...base, type };
      break;
    }
  }

  if (candidate && Object.keys(base).length > 0 && subjectId) {
    if (errors.length > 0) {
      return { rowNumber, data: null, errors };
    }

    const validated = validateQuestionCandidate(candidate);

    return {
      rowNumber,
      data: validated.data,
      errors: validated.errors,
    };
  }

  return { rowNumber, data: null, errors };
}

export function parseXlsx(
  buffer: Buffer,
  subjects: SubjectLookup,
): ParseResult {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
    });
  } catch {
    return emptyParseResult("File XLSX tidak valid atau rusak");
  }

  const sheetName = workbook.SheetNames.includes("questions")
    ? "questions"
    : workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!sheet) {
    return emptyParseResult("Sheet questions tidak ditemukan");
  }

  let rows: Row[];

  try {
    rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
  } catch {
    return emptyParseResult("Sheet questions tidak dapat dibaca");
  }

  if (rows.length === 0) {
    return emptyParseResult("Sheet questions kosong");
  }

  const headerRow = rows[0] ?? [];
  const header = new Map<string, number>();

  headerRow.forEach((cell, index) => {
    const name = toText(cell).replace(/^\ufeff/, "").toLowerCase();

    if (name) {
      header.set(name, index);
    }
  });

  const missing = REQUIRED_HEADERS.filter((name) => !header.has(name));

  if (missing.length > 0) {
    return emptyParseResult(
      `Header tidak lengkap: ${missing.join(", ")}`,
    );
  }

  const dataRows = rows
    .slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => toText(cell) !== ""));

  if (dataRows.length === 0) {
    return emptyParseResult("Tidak ada baris soal di sheet questions");
  }

  if (dataRows.length > MAX_IMPORT_QUESTIONS) {
    return emptyParseResult(
      `Maksimal ${MAX_IMPORT_QUESTIONS} soal per file`,
    );
  }

  return {
    questions: dataRows.map(({ row, rowNumber }) =>
      parseRow(row, rowNumber, header, subjects),
    ),
    globalErrors: [],
  };
}
