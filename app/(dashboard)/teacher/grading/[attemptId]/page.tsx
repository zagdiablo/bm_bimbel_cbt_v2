import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HttpError } from "@/lib/api";
import { requirePageRole } from "@/lib/auth-helpers";
import { formatWib } from "@/lib/exams/datetime";
import { getGradingDetail } from "@/lib/grading/query";
import type { GradingDetail } from "@/lib/grading/types";
import { QUESTION_TYPE_LABEL } from "@/lib/questions/labels";

import { ScoreForm } from "../_components/score-form";

export const metadata: Metadata = {
  title: "Penilaian Attempt",
};

type PageProps = { params: Promise<{ attemptId: string }> };

function formatStudentAnswer(
  labels: string[] | undefined,
  text: string | null | undefined,
): string {
  if (text && text.trim() !== "") {
    return text;
  }

  if (labels && labels.length > 0) {
    return labels.join(", ");
  }

  return "Tidak dijawab";
}

export default async function GradingDetailPage({ params }: PageProps) {
  const { attemptId } = await params;
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    `/teacher/grading/${attemptId}`,
  );

  let detail: GradingDetail;

  try {
    detail = await getGradingDetail(attemptId, user);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) {
        notFound();
      }

      if (error.status === 409) {
        return (
          <div className="mx-auto max-w-xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5" />
                  Attempt belum dapat dinilai
                </CardTitle>
                <CardDescription>{error.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/teacher/grading">Kembali ke daftar</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      }
    }

    throw error;
  }

  const { attempt, essays, objectives, summary } = detail;
  const essayLocked = attempt.status === "GRADED" && user.role !== "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-3">
        <Link
          href="/teacher/grading"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke daftar penilaian
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {attempt.student.name}
              </h1>
              <Badge
                variant={attempt.status === "GRADED" ? "secondary" : "outline"}
              >
                {attempt.status === "GRADED" ? "Sudah dinilai" : "Menunggu nilai"}
              </Badge>
              {attempt.isLate ? (
                <Badge variant="destructive">Terlambat</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground">
              {attempt.examTitle} · {attempt.subject.name} (
              {attempt.subject.code})
            </p>
            <p className="text-sm text-muted-foreground">
              Kelas {attempt.student.classroom ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {essayLocked ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nilai esai terkunci</AlertTitle>
          <AlertDescription>
            Attempt sudah berstatus GRADED. Hanya admin yang dapat mengubah
            nilai esai. Nilai jawaban singkat masih dapat dikoreksi karena
            penilaian otomatisnya bersifat heuristik.
          </AlertDescription>
        </Alert>
      ) : null}

      {attempt.status === "GRADED" ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Penilaian selesai</AlertTitle>
          <AlertDescription>
            Dinilai {formatWib(attempt.gradedAt)}
            {attempt.gradedByName ? ` oleh ${attempt.gradedByName}` : ""}.
            Nilai akhir {attempt.totalScore ?? 0} / {attempt.maxScore}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Nilai</CardDescription>
            <CardTitle className="text-2xl">
              {attempt.totalScore ?? 0} / {attempt.maxScore}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Esai belum dinilai</CardDescription>
            <CardTitle className="text-2xl">
              {summary.pendingEssayCount} / {summary.essayCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dikumpulkan</CardDescription>
            <CardTitle className="text-base">
              {formatWib(attempt.submittedAt)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Diterima server</CardDescription>
            <CardTitle className="text-base">
              {formatWib(attempt.receivedAt)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Soal esai</h2>
          <p className="text-sm text-muted-foreground">
            Nilai per esai disimpan independen. Attempt menjadi GRADED setelah
            semua esai memiliki nilai.
          </p>
        </div>

        {essays.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Ujian ini tidak memiliki soal esai.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {essays.map((essay, index) => {
              const answer = essay.answer;
              const hasScore = answer !== null && answer.score !== null;
              const willFinalize =
                attempt.status === "SUBMITTED" &&
                summary.pendingEssayCount === 1 &&
                !hasScore;

              return (
                <Card key={essay.examQuestionId}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div>
                          <CardTitle className="text-base">
                            Esai {index + 1}
                          </CardTitle>
                          <CardDescription>
                            {essay.points} poin
                            {essay.pointsOverride !== null
                              ? ` (override ${essay.pointsOverride})`
                              : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={hasScore ? "secondary" : "outline"}>
                        {hasScore && answer
                          ? `${answer.score} / ${essay.points}`
                          : "Belum dinilai"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm font-medium">
                      {essay.questionText}
                    </p>

                    <div className="rounded-md border bg-muted/30 p-3">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        Jawaban siswa
                      </div>
                      <p className="whitespace-pre-wrap text-sm">
                        {answer?.textAnswer
                          ? answer.textAnswer
                          : "Siswa tidak menjawab soal ini."}
                      </p>
                    </div>

                    {essay.explanation ? (
                      <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Pembahasan:
                        </span>{" "}
                        {essay.explanation}
                      </p>
                    ) : null}

                    <ScoreForm
                      attemptId={attempt.id}
                      examQuestionId={essay.examQuestionId}
                      endpoint="essays"
                      points={essay.points}
                      score={answer?.score ?? null}
                      baseRevision={answer?.revision ?? 0}
                      disabled={essayLocked}
                      disabledReason="Nilai esai hanya dapat diubah oleh admin setelah attempt GRADED."
                      willFinalize={willFinalize}
                    />

                    {answer?.gradedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Terakhir dinilai {formatWib(answer.gradedAt)}
                        {answer.gradedByName ? ` oleh ${answer.gradedByName}` : ""}.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Ringkasan objektif</h2>
          <p className="text-sm text-muted-foreground">
            Pilihan ganda dan benar/salah bersifat immutable. Jawaban singkat
            dapat dikoreksi manual.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {objectives.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                Tidak ada soal objektif pada ujian ini.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Tipe</TableHead>
                    <TableHead>Soal</TableHead>
                    <TableHead className="w-[180px]">Jawaban siswa</TableHead>
                    <TableHead className="w-[180px]">Kunci</TableHead>
                    <TableHead className="w-[150px]">Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objectives.map((objective) => {
                    const answer = objective.answer;
                    const isShort = objective.type === "SHORT_ANSWER";

                    return (
                      <TableRow key={objective.examQuestionId}>
                        <TableCell>
                          <Badge variant="secondary">
                            {QUESTION_TYPE_LABEL[objective.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-2 max-w-[360px] text-sm">
                            {objective.questionText}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatStudentAnswer(
                            answer?.selectedLabels,
                            answer?.textAnswer,
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {objective.correctLabels
                            .map(
                              (label, index) =>
                                `${label}. ${objective.correctAnswers[index] ?? ""}`,
                            )
                            .join("; ")}
                        </TableCell>
                        <TableCell>
                          {isShort ? (
                            <ScoreForm
                              attemptId={attempt.id}
                              examQuestionId={objective.examQuestionId}
                              endpoint="short-answers"
                              points={objective.points}
                              score={answer?.score ?? null}
                              baseRevision={answer?.revision ?? 0}
                            />
                          ) : (
                            <Badge
                              variant={
                                answer?.isCorrect ? "secondary" : "outline"
                              }
                            >
                              {answer?.score ?? 0} / {objective.points}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
