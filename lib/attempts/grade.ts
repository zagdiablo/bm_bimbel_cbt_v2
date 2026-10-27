import type { ExamSnapshot } from "@/lib/zod-schemas/exam";

export type GradableAnswer = {
  selectedLabels: string[];
  textAnswer: string | null;
};

export type AnswerGrade = {
  isCorrect: boolean | null;
  score: number | null;
};

/**
 * Normalisasi jawaban singkat. Punctuation sengaja TIDAK dihapus:
 * "3,14" dan "314" adalah jawaban berbeda.
 */
export function normalizeShortAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sameLabelSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);

  return left.every((label) => rightSet.has(label));
}

/**
 * Semua tipe objektif dinilai penuh atau nol. Essay mengembalikan `null`
 * karena dinilai manual pada Fase 7.
 */
export function gradeAnswer(
  snapshot: ExamSnapshot,
  answer: GradableAnswer,
  points: number,
): AnswerGrade {
  switch (snapshot.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE": {
      const correctLabels = snapshot.options
        .filter((option) => option.isCorrect)
        .map((option) => option.label);
      const selected = answer.selectedLabels;
      const isCorrect =
        selected.length === 1 &&
        correctLabels.length === 1 &&
        selected[0] === correctLabels[0];

      return {
        isCorrect,
        score: isCorrect ? points : 0,
      };
    }

    case "MULTIPLE_CHOICE": {
      const correctLabels = snapshot.options
        .filter((option) => option.isCorrect)
        .map((option) => option.label);
      const isCorrect =
        correctLabels.length > 0 &&
        answer.selectedLabels.length > 0 &&
        sameLabelSet(answer.selectedLabels, correctLabels);

      return {
        isCorrect,
        score: isCorrect ? points : 0,
      };
    }

    case "SHORT_ANSWER": {
      const submitted = answer.textAnswer
        ? normalizeShortAnswer(answer.textAnswer)
        : "";
      const correctAnswers = snapshot.options
        .filter((option) => option.isCorrect)
        .map((option) => normalizeShortAnswer(option.text))
        .filter((value) => value.length > 0);
      const isCorrect =
        submitted.length > 0 && correctAnswers.includes(submitted);

      return {
        isCorrect,
        score: isCorrect ? points : 0,
      };
    }

    case "ESSAY":
      return { isCorrect: null, score: null };
  }
}
