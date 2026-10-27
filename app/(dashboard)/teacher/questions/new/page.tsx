import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requirePageRole } from "@/lib/auth-helpers";
import { listSubjects } from "@/lib/questions/query";

import { QuestionForm } from "../_components/question-form";

export const metadata: Metadata = {
  title: "Buat Soal",
};

export default async function NewQuestionPage() {
  await requirePageRole(["TEACHER", "ADMIN"], "/teacher/questions/new");
  const subjects = await listSubjects();

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
        <h1 className="text-2xl font-semibold tracking-tight">Buat Soal</h1>
        <p className="text-muted-foreground">
          Susun soal baru untuk bank soal. Kunci jawaban mengikuti tipe soal.
        </p>
      </div>

      <QuestionForm mode="create" subjects={subjects} />
    </div>
  );
}
