import type { QuestionType } from "@prisma/client";

import { HttpError } from "@/lib/api";
import {
  toExamQuestionView,
  type ExamQuestionWithSnapshot,
} from "@/lib/exams/snapshot";

export type AttemptAnswerRecord = {
  selectedLabels: string[];
  textAnswer: string | null;
  answeredAt: Date;
  revision: number;
};

export type SafeAnswerView = {
  selectedLabels: string[];
  textAnswer: string | null;
  answeredAt: string;
  revision: number;
};

export type StudentQuestionView = {
  examQuestionId: string;
  order: number;
  type: QuestionType;
  questionText: string;
  points: number;
  options: { label: string; text: string }[];
  answer: SafeAnswerView | null;
};

const OPTION_TYPES = new Set<QuestionType>([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
]);

const SHUFFLED_OPTION_TYPES = new Set<QuestionType>([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
]);

export function isOptionQuestion(type: QuestionType): boolean {
  return OPTION_TYPES.has(type);
}

export function isShuffledOptionType(type: QuestionType): boolean {
  return SHUFFLED_OPTION_TYPES.has(type);
}

export function toSafeAnswer(
  answer: AttemptAnswerRecord | null,
): SafeAnswerView | null {
  if (!answer) {
    return null;
  }

  return {
    selectedLabels: answer.selectedLabels,
    textAnswer: answer.textAnswer,
    answeredAt: answer.answeredAt.toISOString(),
    revision: answer.revision,
  };
}

export type AttemptIntegrityContext = {
  attemptId?: string;
  examId?: string;
};

/**
 * Pesan 500 yang bisa dipakai guru/admin untuk debug: menyebut field yang
 * rusak, jumlah yang diharapkan, attemptId/examId, tanpa stack trace.
 */
export function attemptIntegrityError(
  detail: string,
  context: AttemptIntegrityContext = {},
): HttpError {
  const suffix = [
    context.attemptId ? `attemptId=${context.attemptId}` : null,
    context.examId ? `examId=${context.examId}` : null,
    "Hubungi admin.",
  ]
    .filter(Boolean)
    .join(" ");

  return new HttpError(500, `Data attempt rusak: ${detail}. ${suffix}`);
}

/**
 * Memvalidasi `Attempt.questionOrder` terhadap baris ExamQuestion yang ada.
 * Data korup harus menjadi error eksplisit, bukan re-shuffle diam-diam.
 */
export function assertQuestionOrder(
  rawOrder: unknown,
  questions: readonly { id: string }[],
  context: AttemptIntegrityContext = {},
): string[] {
  if (
    !Array.isArray(rawOrder) ||
    rawOrder.some((value) => typeof value !== "string")
  ) {
    throw attemptIntegrityError(
      "questionOrder bukan array id yang valid",
      context,
    );
  }

  const order = rawOrder as string[];
  const expectedIds = new Set(questions.map((question) => question.id));
  const seen = new Set<string>();

  if (order.length !== questions.length) {
    throw attemptIntegrityError(
      `questionOrder berisi ${order.length} id, expected ${questions.length} soal`,
      context,
    );
  }

  for (const id of order) {
    if (!expectedIds.has(id) || seen.has(id)) {
      throw attemptIntegrityError(
        "questionOrder berisi id yang tidak cocok/duplikat dibanding daftar soal",
        context,
      );
    }

    seen.add(id);
  }

  return order;
}

export function parseOptionOrderMap(
  raw: unknown,
  context: AttemptIntegrityContext = {},
): Record<string, string[]> | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw attemptIntegrityError("optionOrder harus berupa objek", context);
  }

  const result: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (
      !Array.isArray(value) ||
      value.some((label) => typeof label !== "string")
    ) {
      throw attemptIntegrityError(
        `optionOrder soal ${key} bukan array label`,
        context,
      );
    }

    result[key] = value as string[];
  }

  return result;
}

function orderOptions(
  labels: readonly string[],
  requestedOrder: readonly string[],
  examQuestionId: string,
  context: AttemptIntegrityContext = {},
) {
  const expected = new Set(labels);
  const seen = new Set<string>();

  if (requestedOrder.length !== labels.length) {
    throw attemptIntegrityError(
      `optionOrder soal ${examQuestionId} berisi ${requestedOrder.length} label, expected ${labels.length} opsi`,
      context,
    );
  }

  for (const label of requestedOrder) {
    if (!expected.has(label) || seen.has(label)) {
      throw attemptIntegrityError(
        `optionOrder soal ${examQuestionId} berisi label yang tidak cocok/duplikat dibanding snapshot`,
        context,
      );
    }

    seen.add(label);
  }

  return requestedOrder;
}

/**
 * Satu-satunya mapper baris ExamQuestion + Answer menjadi payload siswa.
 *
 * `toExamQuestionView(..., { forStudent: true })` membuang `isCorrect` dan
 * `explanation`, TETAPI pada SHORT_ANSWER teks kunci ada di `options[].text`.
 * Karena itu opsi tidak pernah dikirim untuk SHORT_ANSWER/ESSAY.
 */
export function toStudentQuestionView(
  examQuestion: ExamQuestionWithSnapshot,
  answer: AttemptAnswerRecord | null,
  requestedOptionOrder: readonly string[] | null,
  context: AttemptIntegrityContext = {},
): StudentQuestionView {
  const view = toExamQuestionView(examQuestion, { forStudent: true });

  if (!view.snapshot) {
    throw attemptIntegrityError(
      `snapshot soal ${examQuestion.id} tidak tersedia`,
      context,
    );
  }

  const snapshot = view.snapshot;
  let options: { label: string; text: string }[] = [];

  if (isOptionQuestion(snapshot.type)) {
    const source = snapshot.options.map((option) => ({
      label: option.label,
      text: option.text,
    }));

    if (requestedOptionOrder) {
      const orderedLabels = orderOptions(
        source.map((option) => option.label),
        requestedOptionOrder,
        examQuestion.id,
        context,
      );
      const byLabel = new Map(source.map((option) => [option.label, option]));

      options = orderedLabels.map((label) => {
        const option = byLabel.get(label);

        if (!option) {
          throw attemptIntegrityError(
            `label opsi ${label} tidak ditemukan pada soal ${examQuestion.id}`,
            context,
          );
        }

        return option;
      });
    } else {
      options = source;
    }
  }

  return {
    examQuestionId: view.id,
    order: view.order,
    type: snapshot.type,
    questionText: snapshot.questionText,
    points: view.points,
    options,
    answer: toSafeAnswer(answer),
  };
}
