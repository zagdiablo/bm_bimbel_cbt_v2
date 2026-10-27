import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requirePageRole } from "@/lib/auth-helpers";
import { fromStoredOptions } from "@/lib/questions/answers";
import { findQuestionForUser, listSubjects } from "@/lib/questions/query";

import {
  QuestionForm,
  type QuestionFormInitialValues,
} from "../../_components/question-form";

export const metadata: Metadata = {
  title: "Edit Soal",
};

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/questions",
  );
  const { id } = await params;

  const [question, subjects] = await Promise.all([
    findQuestionForUser(id, user),
    listSubjects(),
  ]);

  if (!question) {
    notFound();
  }

  const initialValues: QuestionFormInitialValues = {
    subjectId: question.subjectId,
    type: question.type,
    questionText: question.questionText,
    explanation: question.explanation ?? "",
    difficulty: question.difficulty,
    points: question.points,
    ...fromStoredOptions(question.type, question.options),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/teacher/questions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Bank Soal
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit Soal</h1>
        <p className="text-muted-foreground">
          Perubahan menyimpan ulang seluruh opsi jawaban. Mengganti tipe soal
          akan mereset field jawaban yang tidak relevan.
        </p>
      </div>

      <QuestionForm
        mode="edit"
        questionId={question.id}
        subjects={subjects}
        initialValues={initialValues}
      />
    </div>
  );
}
