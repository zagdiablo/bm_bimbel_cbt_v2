import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Clock3,
  KeyRound,
  Users,
} from "lucide-react";

import { AttemptStatusBadge } from "@/components/attempts/attempt-status-badge";
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
import { requirePageRole } from "@/lib/auth-helpers";
import { formatDuration, formatWib } from "@/lib/exams/datetime";
import {
  getExamForReport,
  getReportSummary,
  listReportAttempts,
  listReportClassrooms,
} from "@/lib/reports/query";
import type { ReportDetailQuery } from "@/lib/reports/types";
import {
  reportDetailQuerySchema,
  type ReportDetailQueryInput,
} from "@/lib/zod-schemas/report";

import { ExamStatusBadge } from "../../exams/_components/status-badge";
import { ReportExportButtons } from "./_components/export-buttons";
import { ReportAttemptsFilterBar } from "./_components/report-attempts-filter-bar";
import { ScoreHistogram } from "./_components/score-histogram";

export const metadata: Metadata = {
  title: "Detail Laporan",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function normalizeParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") {
      entries.push([key, value]);
      continue;
    }

    if (Array.isArray(value) && value[0]) {
      entries.push([key, value[0]]);
    }
  }

  return Object.fromEntries(entries);
}

function buildHref(
  examId: string,
  query: ReportDetailQueryInput,
  page: number,
): string {
  const params = new URLSearchParams();

  if (query.classroom) params.set("classroom", query.classroom);
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  params.set("page", String(page));

  return `/teacher/reports/${examId}?${params.toString()}`;
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}

function scoreText(value: number | null): string {
  return value === null ? "—" : String(value);
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/reports",
  );
  const { examId } = await params;
  const exam = await getExamForReport(examId, user);

  if (!exam) {
    notFound();
  }

  const rawParams = await searchParams;
  const parsed = reportDetailQuerySchema.safeParse(
    normalizeParams(rawParams),
  );
  const query: ReportDetailQuery = parsed.success
    ? parsed.data
    : reportDetailQuerySchema.parse({});

  const [stats, classrooms, attempts] = await Promise.all([
    getReportSummary(examId),
    listReportClassrooms(examId),
    listReportAttempts(examId, query),
  ]);

  const totalPages = Math.max(1, Math.ceil(attempts.total / attempts.pageSize));
  const hasFilter = Boolean(query.classroom || query.status || query.search);
  const rangeStart =
    attempts.total === 0 ? 0 : (attempts.page - 1) * attempts.pageSize + 1;
  const rangeEnd = Math.min(
    attempts.page * attempts.pageSize,
    attempts.total,
  );

  const exportParams = new URLSearchParams();

  if (query.classroom) exportParams.set("classroom", query.classroom);
  if (query.status) exportParams.set("status", query.status);
  if (query.search) exportParams.set("search", query.search);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/teacher/reports">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke laporan
          </Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ExamStatusBadge status={exam.status} />
          <span>
            {exam.subject.name} ({exam.subject.code})
          </span>
          <span>·</span>
          <span>Guru: {exam.owner.name}</span>
          {exam.token && exam.status !== "DRAFT" ? (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 font-mono text-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                {exam.token}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Jadwal
            </p>
            <p>{formatWib(exam.startAt)}</p>
            <p className="text-muted-foreground">s.d. {formatWib(exam.endAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Durasi
            </p>
            <p>{formatDuration(exam.durationMinutes)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Token
            </p>
            <p className="font-mono">{exam.token ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hasil ke siswa
            </p>
            <p>{exam.showResult ? "Ditampilkan" : "Disembunyikan"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total Attempt"
          value={String(stats.totalAttempts)}
          description={`${stats.byStatus.graded} dinilai · ${stats.byStatus.submitted} menunggu · ${stats.byStatus.inProgress} berjalan`}
        />
        <StatCard
          label="Sudah Dinilai"
          value={String(stats.graded.count)}
          description={`Avg ${scoreText(stats.graded.avgScore)} · Min ${scoreText(
            stats.graded.minScore,
          )} · Max ${scoreText(stats.graded.maxScore)}`}
        />
        <StatCard
          label="Menunggu Penilaian"
          value={String(stats.byStatus.submitted)}
          description="Attempt SUBMITTED"
        />
        <StatCard
          label="Belum Selesai"
          value={String(stats.byStatus.inProgress)}
          description="Attempt IN_PROGRESS"
        />
        <StatCard
          label="Rata-rata Persentase"
          value={
            stats.graded.avgPercentage === null
              ? "—"
              : `${stats.graded.avgPercentage}%`
          }
          description="Dari attempt GRADED"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Distribusi Nilai
            </CardTitle>
            <CardDescription>
              Persentase per attempt terhadap nilai maksimumnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreHistogram bins={stats.histogram} />
            {stats.invalidScores > 0 ? (
              <p className="mt-3 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.invalidScores} attempt GRADED memiliki nilai tidak valid.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Ringkasan
            </CardTitle>
            <CardDescription>
              {stats.graded.count} attempt sudah dinilai dari{" "}
              {stats.totalAttempts} attempt.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rata-rata</span>
              <span className="font-medium">
                {scoreText(stats.graded.avgScore)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nilai terendah</span>
              <span className="font-medium">
                {scoreText(stats.graded.minScore)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nilai tertinggi</span>
              <span className="font-medium">
                {scoreText(stats.graded.maxScore)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rata-rata persentase</span>
              <span className="font-medium">
                {stats.graded.avgPercentage === null
                  ? "—"
                  : `${stats.graded.avgPercentage}%`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Histogram total</span>
              <span className="font-medium">
                {stats.histogramTotal} / {stats.graded.count}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[74px] animate-pulse p-4" />
          </Card>
        }
      >
        <ReportAttemptsFilterBar classrooms={classrooms} />
      </Suspense>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" />
                Attempt Siswa
              </CardTitle>
              <CardDescription>
                {hasFilter
                  ? `Menampilkan ${attempts.total} attempt sesuai filter.`
                  : `${attempts.total} attempt pada ujian ini.`}
              </CardDescription>
            </div>
            <ReportExportButtons
              examId={exam.id}
              filterQuery={exportParams.toString()}
              total={attempts.total}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {attempts.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">
                {hasFilter
                  ? "Tidak ada attempt yang cocok dengan filter"
                  : "Belum ada attempt"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasFilter
                  ? "Coba ubah filter kelas, status, atau nama siswa."
                  : "Siswa akan muncul di sini setelah bergabung dan mengerjakan ujian."}
              </p>
              {hasFilter ? (
                <Button variant="outline" asChild>
                  <Link href={`/teacher/reports/${exam.id}`}>
                    Reset filter
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Siswa</TableHead>
                      <TableHead className="w-[160px]">Mulai</TableHead>
                      <TableHead className="w-[170px]">Submit</TableHead>
                      <TableHead className="w-[160px]">Status</TableHead>
                      <TableHead className="w-[130px] text-right">Nilai</TableHead>
                      <TableHead className="w-[160px]">Dinilai</TableHead>
                      <TableHead className="w-[100px] text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.items.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {attempt.student.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {attempt.student.classroom ?? "Tanpa Kelas"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatWib(attempt.startedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">
                              {formatWib(attempt.submittedAt)}
                            </span>
                            {attempt.isLate ? (
                              <Badge
                                variant="destructive"
                                className="w-fit text-[10px]"
                              >
                                Terlambat
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AttemptStatusBadge status={attempt.status} />
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {attempt.totalScore === null
                            ? "—"
                            : `${attempt.totalScore} / ${attempt.maxScore}`}
                          {attempt.percentage === null ? null : (
                            <span className="block text-xs text-muted-foreground">
                              {attempt.percentage}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {formatWib(attempt.gradedAt)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {attempt.gradedBy?.name ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {attempt.status === "IN_PROGRESS" ? (
                            <span className="text-xs text-muted-foreground">
                              Belum selesai
                            </span>
                          ) : (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/teacher/grading/${attempt.id}`}>
                                Lihat
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {rangeStart}–{rangeEnd} dari {attempts.total}{" "}
                  attempt
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Halaman {attempts.page} / {totalPages}
                  </span>

                  {attempts.page > 1 ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={buildHref(exam.id, query, attempts.page - 1)}
                      >
                        Sebelumnya
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Sebelumnya
                    </Button>
                  )}

                  {attempts.page < totalPages ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={buildHref(exam.id, query, attempts.page + 1)}
                      >
                        Berikutnya
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Berikutnya
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
