import type { QuestionType } from "@prisma/client";

export type GradingListQuery = {
  examId?: string;
  search?: string;
  page: number;
  pageSize: number;
};

export type GradingStudent = {
  id: string;
  name: string;
  classroom: string | null;
};

export type GradingExamSummary = {
  id: string;
  title: string;
  subject: { name: string; code: string };
};

export type GradingListItem = {
  id: string;
  examId: string;
  examTitle: string;
  subject: { name: string; code: string };
  student: GradingStudent;
  submittedAt: string | null;
  receivedAt: string | null;
  isLate: boolean;
  totalScore: number | null;
  maxScore: number;
  essayCount: number;
  pendingEssayCount: number;
  integrityError: string | null;
};

export type GradingListResult = {
  items: GradingListItem[];
  total: number;
  page: number;
  pageSize: number;
  swept: number;
};

export type GradingAttemptInfo = {
  id: string;
  examId: string;
  examTitle: string;
  subject: { name: string; code: string };
  student: GradingStudent;
  status: "SUBMITTED" | "GRADED";
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  receivedAt: string | null;
  gradedAt: string | null;
  gradedById: string | null;
  gradedByName: string | null;
  totalScore: number | null;
  maxScore: number;
  showResult: boolean;
  isLate: boolean;
};

export type GradingAnswerView = {
  id: string;
  selectedLabels: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  score: number | null;
  revision: number;
  answeredAt: string;
  gradedAt: string | null;
  gradedById: string | null;
  gradedByName: string | null;
};

export type GradingEssayItem = {
  examQuestionId: string;
  order: number;
  questionText: string;
  explanation: string | null;
  points: number;
  pointsOverride: number | null;
  answer: GradingAnswerView | null;
};

export type GradingObjectiveItem = {
  examQuestionId: string;
  order: number;
  type: QuestionType;
  questionText: string;
  explanation: string | null;
  points: number;
  pointsOverride: number | null;
  correctLabels: string[];
  correctAnswers: string[];
  answer: GradingAnswerView | null;
};

export type GradingDetail = {
  attempt: GradingAttemptInfo;
  essays: GradingEssayItem[];
  objectives: GradingObjectiveItem[];
  summary: {
    totalScore: number;
    essayCount: number;
    pendingEssayCount: number;
    canFinalize: boolean;
  };
};
