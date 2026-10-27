import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  ListChecks,
  Shuffle,
  Target,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-helpers";
import { formatDuration, formatWib } from "@/lib/exams/datetime";
import { getExamDetailForUser } from "@/lib/exams/query";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/questions/labels";

import { ExamActions } from "../_components/exam-actions";
import { ExamStatusBadge } from "../_components/status-badge";
import { TokenCard } from "../_components/token-card";

export const metadata: Metadata = {
  title: "Detail Ujian",
};

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/exams",
  );
  const { id } = await params;
  const exam = await getExamDetailForUser(id, user);

  if (!exam) {
    notFound();
  }

  const publishDisabledReason =
    exam.questionCount === 0
      ? "Tambahkan minimal 1 soal terlebih dahulu"
      : !exam.startAt || !exam.endAt
        ? "Lengkapi jadwal mulai dan selesai"
        : exam.endAt.getTime() <= Date.now()
          ? "Jadwal selesai sudah lewat"
          : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <Link
          href="/teacher/exams"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Manajemen Ujian
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {exam.title}
              </h1>
              <ExamStatusBadge status={exam.status} />
            </div>
            <p className="text-muted-foreground">
              {exam.subject.name} ({exam.subject.code}) · dibuat oleh{" "}
              {exam.owner.name}
            </p>
          </div>

          <ExamActions
            examId={exam.id}
            title={exam.title}
            status={exam.status}
            publishDisabled={publishDisabledReason !== null}
            publishDisabledReason={publishDisabledReason}
          />
        </div>

        {exam.status === "DRAFT" && publishDisabledReason ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Belum siap dipublikasikan</AlertTitle>
            <AlertDescription>{publishDisabledReason}.</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Durasi">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(exam.durationMinutes)}
              </span>
            </InfoRow>
            <InfoRow label="Mulai">{formatWib(exam.startAt)}</InfoRow>
            <InfoRow label="Selesai">{formatWib(exam.endAt)}</InfoRow>
            <InfoRow label="Jumlah soal">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                {exam.questionCount} soal
              </span>
            </InfoRow>
            <InfoRow label="Total poin">
              <span className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                {exam.totalPoints} poin
              </span>
            </InfoRow>
            <InfoRow label="Publish">
              {exam.publishedAt
                ? `${formatWib(exam.publishedAt)} · ${exam.publishedBy?.name ?? "—"}`
                : "Belum"}
            </InfoRow>
            <InfoRow label="Ditutup">
              {exam.closedAt
                ? `${formatWib(exam.closedAt)} · ${exam.closedBy?.name ?? "—"}`
                : "Belum"}
            </InfoRow>
            <InfoRow label="Acak soal">
              <span className="inline-flex items-center gap-1">
                <Shuffle className="h-3.5 w-3.5" />
                {exam.shuffleQuestions ? "Ya" : "Tidak"}
              </span>
            </InfoRow>
            <InfoRow label="Acak pilihan">
              {exam.shuffleOptions ? "Ya" : "Tidak"}
            </InfoRow>
            <InfoRow label="Tampilkan hasil">
              {exam.showResult ? "Ya" : "Tidak"}
            </InfoRow>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {exam.token ? <TokenCard token={exam.token} /> : null}
          {exam.status === "DRAFT" ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Langkah berikutnya</CardTitle>
                <CardDescription>
                  Publish membuat snapshot dan mengunci konten.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" asChild className="w-full">
                  <Link href={`/teacher/exams/${exam.id}/edit`}>
                    Kelola soal dan pengaturan
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {exam.status === "DRAFT" &&
      exam.questions.some((question) => !question.sourceAvailable) ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sebagian soal sudah tidak tersedia</AlertTitle>
          <AlertDescription>
            Hapus soal yang ditandai sebelum mempublikasikan ujian.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Preview soal ({exam.questionCount})
          </CardTitle>
          <CardDescription>
            {exam.status === "DRAFT"
              ? "Konten mengikuti bank soal live dan akan di-snapshot saat publish."
              : "Konten dibaca dari snapshot permanen. Perubahan bank soal tidak memengaruhi ujian ini."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exam.questions.length === 0 ? (
            <div className="rounded-md border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              Belum ada soal. Buka halaman edit untuk memilih soal dari bank
              soal.
            </div>
          ) : (
            <ol className="space-y-4">
              {exam.questions.map((question, index) => {
                const snapshot = question.snapshot;

                return (
                  <li
                    key={question.id}
                    className="rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div>
                          {snapshot ? (
                            <p className="whitespace-pre-wrap text-sm font-medium">
                              {snapshot.questionText}
                            </p>
                          ) : (
                            <p className="text-sm font-medium text-destructive">
                              Soal sudah tidak tersedia di bank soal
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {snapshot ? (
                              <>
                                <Badge variant="secondary">
                                  {QUESTION_TYPE_LABEL[snapshot.type]}
                                </Badge>
                                <Badge variant="outline">
                                  {DIFFICULTY_LABEL[snapshot.difficulty]}
                                </Badge>
                              </>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {question.points} poin
                              {question.pointsOverride !== null
                                ? ` (override ${question.pointsOverride})`
                                : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {snapshot && snapshot.options.length > 0 ? (
                      <ul className="mt-3 space-y-1 pl-8">
                        {snapshot.options.map((option) => (
                          <li
                            key={`${question.id}-${option.label}`}
                            className="flex items-start gap-2 text-sm"
                          >
                            <span className="font-medium">
                              {option.label}.
                            </span>
                            <span className="flex-1">{option.text}</span>
                            {option.isCorrect ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <Check className="h-3.5 w-3.5" />
                                Kunci
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {snapshot?.explanation ? (
                      <p className="mt-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Pembahasan:
                        </span>{" "}
                        {snapshot.explanation}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
