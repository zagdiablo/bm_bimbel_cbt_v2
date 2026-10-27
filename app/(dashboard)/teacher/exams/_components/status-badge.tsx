import { Badge } from "@/components/ui/badge";
import { EXAM_STATUS_LABEL } from "@/lib/exams/labels";
import type { ExamStatusValue } from "@/lib/zod-schemas/exam";

const VARIANT: Record<
  ExamStatusValue,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  CLOSED: "secondary",
};

export function ExamStatusBadge({ status }: { status: ExamStatusValue }) {
  return <Badge variant={VARIANT[status]}>{EXAM_STATUS_LABEL[status]}</Badge>;
}
