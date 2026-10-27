import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageRole } from "@/lib/auth-helpers";
import { isoToWibInput } from "@/lib/exams/datetime";
import { getExamDetailForUser } from "@/lib/exams/query";
import { listSubjects } from "@/lib/questions/query";

import { ExamForm, type ExamFormValues } from "../../_components/exam-form";
import type { SelectedExamQuestion } from "../../_components/types";

export const metadata: Metadata = {
  title: "Edit Ujian",
};

export default async function EditExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/exams",
  );
  const { id } = await params;

  const [exam, subjects] = await Promise.all([
    getExamDetailForUser(id, user),
    listSubjects(),
  ]);

  if (!exam) {
    notFound();
  }

  if (exam.status !== "DRAFT") {
    redirect(`/teacher/exams/${id}`);
  }

  const initialValues: ExamFormValues = {
    title: exam.title,
    subjectId: exam.subjectId,
    durationMinutes: exam.durationMinutes,
    startAt: isoToWibInput(exam.startAt),
    endAt: isoToWibInput(exam.endAt),
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    showResult: exam.showResult,
  };

  const initialQuestions: SelectedExamQuestion[] = [];

  for (const question of exam.questions) {
    if (!question.snapshot) {
      continue;
    }

    initialQuestions.push({
      questionId: question.snapshot.questionId,
      questionText: question.snapshot.questionText,
      type: question.snapshot.type,
      difficulty: question.snapshot.difficulty,
      defaultPoints: question.snapshot.points,
      pointsOverride: question.pointsOverride,
      sourceAvailable: question.sourceAvailable,
    });
  }

  const unavailableCount = exam.questions.length - initialQuestions.length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-2">
        <Link
          href={`/teacher/exams/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Detail Ujian
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit Ujian</h1>
        <p className="text-muted-foreground">
          Perubahan hanya tersedia untuk draft. Publish akan mengunci konten dan
          membuat snapshot permanen.
        </p>
      </div>

      {unavailableCount > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ada soal yang sudah tidak tersedia</AlertTitle>
          <AlertDescription>
            {unavailableCount} soal sudah dihapus dari bank soal dan tidak
            ditampilkan di editor. Simpan perubahan untuk membersihkannya dari
            daftar ujian.
          </AlertDescription>
        </Alert>
      ) : null}

      <ExamForm
        mode="edit"
        examId={exam.id}
        subjects={subjects}
        initialValues={initialValues}
        initialQuestions={initialQuestions}
      />
    </div>
  );
}
