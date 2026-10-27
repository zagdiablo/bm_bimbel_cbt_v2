import {
  EXAM_STATUSES,
  type ExamStatusValue,
} from "@/lib/zod-schemas/exam";

export const EXAM_STATUS_LABEL: Record<ExamStatusValue, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Dipublikasikan",
  CLOSED: "Ditutup",
};

export const EXAM_STATUS_OPTIONS = EXAM_STATUSES.map((value) => ({
  value,
  label: EXAM_STATUS_LABEL[value],
}));
