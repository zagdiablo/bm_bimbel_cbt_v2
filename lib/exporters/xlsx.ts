import * as XLSX from "xlsx";

import { fromStoredOptions } from "@/lib/questions/answers";
import type { QuestionListItem } from "@/lib/questions/query";

/**
 * Header ini harus identik dengan template import Fase 3
 * (`scripts/generate-templates.ts` + `lib/importers/xlsx.ts`) supaya file hasil
 * export bisa langsung diunggah kembali ke fitur import.
 */
export const XLSX_EXPORT_HEADERS = [
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

export const XLSX_EXPORT_SHEET = "questions";

const OPTION_COLUMN_COUNT = 5;
const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

export type XlsxExportRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  string,
];

function emptyOptions(): string[] {
  return Array.from({ length: OPTION_COLUMN_COUNT }, () => "");
}

/**
 * Satu baris sheet `questions`. Label opsi selalu dipetakan ulang berdasarkan
 * urutan (kolom A–E), bukan label tersimpan, karena parser import membaca label
 * dari posisi kolom. Dengan begitu data lama berlabel aneh tetap round-trip.
 */
export function buildXlsxRow(question: QuestionListItem): XlsxExportRow {
  const answers = fromStoredOptions(question.type, question.options);
  const options = emptyOptions();
  let correctAnswers = "";

  switch (question.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const choiceOptions = answers.options.slice(0, OPTION_COLUMN_COUNT);
      const correctLabels: string[] = [];

      choiceOptions.forEach((option, index) => {
        options[index] = option.text;

        if (option.isCorrect) {
          correctLabels.push(OPTION_LABELS[index]);
        }
      });

      correctAnswers = correctLabels.join(",");
      break;
    }

    case "TRUE_FALSE":
      correctAnswers = answers.correctAnswer ? "true" : "false";
      break;

    case "SHORT_ANSWER":
      // Parser import Fase 3 menolak kolom opsi untuk SHORT_ANSWER. Variasi
      // jawaban karena itu hanya ditulis di `correct_answers` (dipisah pipa),
      // bukan di option_a–option_e, agar hasil export tetap bisa di-re-import.
      correctAnswers = answers.correctAnswers.join("|");
      break;

    case "ESSAY":
      break;
  }

  return [
    question.subject.code,
    question.type,
    question.questionText,
    options[0],
    options[1],
    options[2],
    options[3],
    options[4],
    correctAnswers,
    question.points,
    question.difficulty,
    question.explanation ?? "",
  ];
}

export function buildXlsxRows(
  questions: readonly QuestionListItem[],
): XlsxExportRow[] {
  return questions.map(buildXlsxRow);
}

export function renderQuestionsXlsx(
  questions: readonly QuestionListItem[],
): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [...XLSX_EXPORT_HEADERS],
    ...buildXlsxRows(questions),
  ]);

  sheet["!cols"] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 48 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 8 },
    { wch: 12 },
    { wch: 48 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, XLSX_EXPORT_SHEET);

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}
