import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardList, Clock3, History } from "lucide-react";

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
  listStudentAttempts,
  listStudentExams,
} from "@/lib/attempts/service";
import { requirePageRole } from "@/lib/auth-helpers";
import { formatDuration, formatWib } from "@/lib/exams/datetime";

import { AttemptStatusBadge } from "./_components/attempt-status-badge";
import { JoinExamDialog } from "./_components/join-exam-dialog";

export const metadata: Metadata = {
  title: "Ujian Saya",
};

export default async function StudentExamsPage() {
  const user = await requirePageRole(["STUDENT"], "/student/exams");
  const [active, attempts] = await Promise.all([
    listStudentExams(user.id),
    listStudentAttempts(user.id),
  ]);
  const activeIds = new Set(active.items.map((exam) => exam.id));
  const history = attempts.items.filter((item) => !activeIds.has(item.examId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ujian Saya</h1>
          <p className="text-muted-foreground">
            Gabung dengan token dari guru, lalu kerjakan ujian sebelum waktu
            habis.
          </p>
        </div>
        <JoinExamDialog />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Ujian aktif</h2>
        </div>

        {active.items.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Belum ada ujian yang sedang dibuka. Hubungi guru jika jadwal
              seharusnya sudah dimulai.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.items.map((exam) => {
              const attempt = exam.attempt;
              const canResume =
                attempt?.status === "IN_PROGRESS" || attempt?.isExpired;
              const canSeeResult =
                attempt?.status === "SUBMITTED" ||
                (attempt?.status === "GRADED" && exam.showResult);

              return (
                <Card key={exam.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{exam.title}</CardTitle>
                        <CardDescription>
                          {exam.subject.name} ({exam.subject.code})
                        </CardDescription>
                      </div>
                      <AttemptStatusBadge
                        status={attempt?.status ?? null}
                        isExpired={attempt?.isExpired}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="grid gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4" />
                        {formatDuration(exam.durationMinutes)}
                      </span>
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4" />
                        {formatWib(exam.startAt)} — {formatWib(exam.endAt)}
                      </span>
                    </div>

                    {attempt &&
                    attempt.totalScore !== null &&
                    attempt.maxScore !== null ? (
                      <p className="text-sm font-medium">
                        Nilai: {attempt.totalScore} / {attempt.maxScore}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap gap-2">
                      {!attempt ? (
                        <p className="text-sm text-muted-foreground">
                          Gunakan tombol <strong>Gabung ujian</strong> dengan
                          token dari guru untuk memulai.
                        </p>
                      ) : null}

                      {canResume ? (
                        <Button asChild size="sm">
                          <Link href={`/student/exams/${exam.id}/take`}>
                            {attempt?.isExpired ? "Selesaikan" : "Lanjutkan"}
                          </Link>
                        </Button>
                      ) : null}

                      {canSeeResult ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/student/exams/${exam.id}/result`}>
                            {attempt?.status === "SUBMITTED"
                              ? "Lihat status"
                              : "Lihat hasil"}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Riwayat</h2>
        </div>

        {history.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Belum ada riwayat ujian.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((attempt) => (
              <Card key={attempt.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{attempt.examTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.subject.name} · {formatWib(attempt.startedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {attempt.totalScore !== null &&
                    attempt.maxScore !== null ? (
                      <Badge variant="outline">
                        {attempt.totalScore} / {attempt.maxScore}
                      </Badge>
                    ) : null}
                    <AttemptStatusBadge
                      status={attempt.status}
                      isExpired={attempt.isExpired}
                    />
                    <Button asChild size="sm" variant="outline">
                      <Link href={attempt.redirectTo}>
                        {attempt.status === "IN_PROGRESS"
                          ? "Lanjutkan"
                          : attempt.status === "SUBMITTED"
                            ? "Status"
                            : attempt.showResult
                              ? "Hasil"
                              : "Detail"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
