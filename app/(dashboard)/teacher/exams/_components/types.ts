import type {
  DifficultyValue,
  QuestionTypeValue,
} from "@/lib/zod-schemas/question";

export type PickerQuestion = {
  id: string;
  questionText: string;
  type: QuestionTypeValue;
  difficulty: DifficultyValue;
  points: number;
};

export type SelectedExamQuestion = {
  questionId: string;
  questionText: string;
  type: QuestionTypeValue | null;
  difficulty: DifficultyValue | null;
  defaultPoints: number;
  pointsOverride: number | null;
  sourceAvailable: boolean;
};
