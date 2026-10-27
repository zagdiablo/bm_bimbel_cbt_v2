import {
  DIFFICULTIES,
  QUESTION_TYPES,
  type DifficultyValue,
  type QuestionTypeValue,
} from "@/lib/zod-schemas/question";

export const QUESTION_TYPE_LABEL: Record<QuestionTypeValue, string> = {
  SINGLE_CHOICE: "Pilihan Ganda",
  MULTIPLE_CHOICE: "PG Kompleks",
  TRUE_FALSE: "Benar/Salah",
  SHORT_ANSWER: "Jawaban Singkat",
  ESSAY: "Esai",
};

export const DIFFICULTY_LABEL: Record<DifficultyValue, string> = {
  EASY: "Mudah",
  MEDIUM: "Sedang",
  HARD: "Sulit",
};

export const QUESTION_TYPE_OPTIONS = QUESTION_TYPES.map((value) => ({
  value,
  label: QUESTION_TYPE_LABEL[value],
}));

export const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({
  value,
  label: DIFFICULTY_LABEL[value],
}));
