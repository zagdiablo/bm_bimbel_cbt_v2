import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, EyeOff, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  finalizeAttempt,
  findAttemptByExam,
} from "@/lib/attempts/service";
import { hasExpired } from "@/lib/attempts/time";
import { requirePageRole } from "@/lib/auth-helpers";
import { formatWib } from "@/lib/exams/datetime";

export const metadata: Metadata = {
  title: "Hasil Ujian",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function ExamResultPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requirePageRole(["STUDENT"], `/student/exams/${id}/result`);
  let attempt = await findAttemptByExam(id, user.id);

  if (!attempt) {
    redirect("/student/exams");
  }

  if (attempt.status === "IN_PROGRESS" && hasExpired(attempt.expiresAt)) {
    attempt = await finalizeAttempt(attempt.id, user.id);
  }

  if (attempt.status === "IN_PROGRESS") {
    redirect(`/student/exams/${id}/take`);
  }

  if (!attempt.exam.showResult) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5" />
              Hasil tidak ditampilkan
            </CardTitle>
            <CardDescription>
              Guru menonaktifkan tampilan hasil untuk ujian ini. Hubungi guru
              jika membutuhkan nilai.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/student/exams">Kembali ke daftar ujian</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pending = attempt.status === "SUBMITTED";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{attempt.exam.title}</CardTitle>
          <CardDescription>
            {attempt.exam.subject.name} ({attempt.exam.subject.code})
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {pending ? (
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
              <Clock3 className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Menunggu penilaian guru</p>
                <p className="text-sm text-muted-foreground">
                  Jawaban objektif sudah dinilai. Soal esai akan dinilai
                  manual pada tahap penilaian.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-amber-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Nilai akhir</p>
                  <p className="text-2xl font-semibold">
                    {attempt.totalScore} / {attempt.maxScore}
                  </p>
                </div>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
          )}

          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Dikumpulkan</dt>
              <dd>{formatWib(attempt.submittedAt)}</dd>
            </div>
            {attempt.gradedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Dinilai</dt>
                <dd>{formatWib(attempt.gradedAt)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Batas waktu</dt>
              <dd>{formatWib(attempt.expiresAt)}</dd>
            </div>
          </dl>

          <Button asChild>
            <Link href="/student/exams">Kembali ke daftar ujian</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
