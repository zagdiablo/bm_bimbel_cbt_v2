import type {
  QuestionInput,
  QuestionTypeValue,
} from "@/lib/zod-schemas/question";

export type StoredOption = {
  label: string;
  text: string;
  isCorrect: boolean;
  order: number;
};

/**
 * Bentuk jawaban yang dipakai form: satu objek dengan semua field varian.
 * Field yang tidak relevan selalu dikosongkan supaya tidak ada state nyangkut
 * saat tipe soal diganti.
 */
export type VariantAnswers = {
  options: { label: string; text: string; isCorrect: boolean }[];
  correctAnswer: boolean;
  correctAnswers: string[];
};

/**
 * Input API memakai bentuk ramah-tipe (correctAnswer / correctAnswers), tetapi
 * penyimpanan selalu memakai tabel `question_options` — sama seperti data seed:
 *
 * - TRUE_FALSE  → 2 baris: "Benar" dan "Salah", salah satunya isCorrect.
 * - SHORT_ANSWER → satu baris `KUNCI-n` per jawaban benar.
 * - ESSAY       → tanpa baris opsi.
 */
export function toStoredOptions(input: QuestionInput): StoredOption[] {
  switch (input.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return input.options.map((option, index) => ({
        label: option.label,
        text: option.text,
        isCorrect: option.isCorrect,
        order: index + 1,
      }));

    case "TRUE_FALSE":
      return [
        { label: "A", text: "Benar", isCorrect: input.correctAnswer, order: 1 },
        { label: "B", text: "Salah", isCorrect: !input.correctAnswer, order: 2 },
      ];

    case "SHORT_ANSWER":
      return input.correctAnswers.map((answer, index) => ({
        label: `KUNCI-${index + 1}`,
        text: answer,
        isCorrect: true,
        order: index + 1,
      }));

    case "ESSAY":
      return [];
  }
}

type StoredOptionLike = {
  label: string;
  text: string;
  isCorrect: boolean;
  order: number;
};

function byOrder<T extends StoredOptionLike>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => a.order - b.order);
}

/**
 * Kebalikan dari `toStoredOptions`, dipakai halaman edit untuk mengisi form.
 * Toleran terhadap data seed lama (mis. SHORT_ANSWER dengan label "KUNCI"
 * tunggal, atau TRUE_FALSE yang urutannya berbeda).
 */
export function fromStoredOptions(
  type: QuestionTypeValue,
  options: readonly StoredOptionLike[],
): VariantAnswers {
  const ordered = byOrder(options);

  switch (type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return {
        options: ordered.map((option) => ({
          label: option.label,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        correctAnswer: false,
        correctAnswers: [],
      };

    case "TRUE_FALSE": {
      const trueRow =
        ordered.find((option) => option.text.trim().toLowerCase() === "benar") ??
        ordered.find((option) => option.label === "A");

      return {
        options: [],
        correctAnswer: trueRow ? trueRow.isCorrect : true,
        correctAnswers: [],
      };
    }

    case "SHORT_ANSWER": {
      const answers = ordered.filter((option) => option.isCorrect);
      const source = answers.length > 0 ? answers : ordered;

      return {
        options: [],
        correctAnswer: false,
        correctAnswers: source.map((option) => option.text),
      };
    }

    case "ESSAY":
      return { options: [], correctAnswer: false, correctAnswers: [] };
  }
}
