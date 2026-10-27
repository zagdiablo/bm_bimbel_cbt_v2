import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requirePageRole } from "@/lib/auth-helpers";
import { listSubjects } from "@/lib/questions/query";

import { ExamForm } from "../_components/exam-form";

export const metadata: Metadata = {
  title: "Buat Ujian",
};

export default async function NewExamPage() {
  await requirePageRole(["TEACHER", "ADMIN"], "/teacher/exams/new");
  const subjects = await listSubjects();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/teacher/exams"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Manajemen Ujian
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Buat Ujian</h1>
        <p className="text-muted-foreground">
          Isi informasi dasar terlebih dahulu. Setelah draft dibuat, Anda akan
          memilih soal dari bank soal.
        </p>
      </div>

      <ExamForm mode="create" subjects={subjects} />
    </div>
  );
}
