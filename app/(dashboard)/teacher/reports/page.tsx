import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePageRole } from "@/lib/auth-helpers";
import { formatWib } from "@/lib/exams/datetime";
import { listSubjects } from "@/lib/questions/query";
import { listReportExams } from "@/lib/reports/query";
import {
  reportListQuerySchema,
  type ReportListQueryInput,
} from "@/lib/zod-schemas/report";

import { ExamStatusBadge } from "../exams/_components/status-badge";
import { ReportFilterBar } from "./_components/report-filter-bar";

export const metadata: Metadata = {
  title: "Laporan Hasil Ujian",
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

function buildHref(query: ReportListQueryInput, page: number): string {
  const params = new URLSearchParams();

  if (query.status) params.set("status", query.status);
  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.search) params.set("search", query.search);
  if (query.startFrom) params.set("startFrom", query.startFrom);
  if (query.startTo) params.set("startTo", query.startTo);
  params.set("page", String(page));

  return `/teacher/reports?${params.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/reports",
  );
  const rawParams = await searchParams;
  const parsed = reportListQuerySchema.safeParse(normalizeParams(rawParams));
  const query: ReportListQueryInput = parsed.success
    ? parsed.data
    : reportListQuerySchema.parse({});

  const [result, subjects] = await Promise.all([
    listReportExams(query, user),
    listSubjects(),
  ]);

  const { items, total, page, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilter = Boolean(
    query.search ||
      query.status ||
      query.subjectId ||
      query.startFrom ||
      query.startTo,
  );
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Laporan Hasil Ujian
        </h1>
        <p className="text-muted-foreground">
          {user.role === "ADMIN"
            ? "Anda melihat hasil ujian dari semua guru."
            : "Anda melihat hasil ujian milik Anda sendiri."}
        </p>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[98px] animate-pulse p-4" />
          </Card>
        }
      >
        <ReportFilterBar subjects={subjects} />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">
                {hasFilter
                  ? "Tidak ada laporan yang cocok dengan filter"
                  : "Belum ada hasil ujian"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasFilter
                  ? "Coba ubah kata kunci atau reset filter untuk melihat semua laporan."
                  : "Laporan muncul otomatis setelah siswa mengerjakan ujian yang dipublikasikan."}
              </p>

              {hasFilter ? (
                <Button variant="outline" asChild>
                  <Link href="/teacher/reports">Reset filter</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ujian</TableHead>
                    <TableHead className="w-[140px]">Mapel</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[170px]">Jadwal</TableHead>
                    <TableHead className="w-[70px] text-center">Total</TableHead>
                    <TableHead className="w-[80px] text-center">Dinilai</TableHead>
                    <TableHead className="w-[90px] text-center">Menunggu</TableHead>
                    <TableHead className="w-[80px] text-center">Berjalan</TableHead>
                    <TableHead className="w-[110px] text-center">
                      Rata-rata
                    </TableHead>
                    <TableHead className="w-[110px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="truncate font-medium" title={exam.title}>
                            {exam.title}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {exam.subject.name}
                      </TableCell>
                      <TableCell>
                        <ExamStatusBadge status={exam.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatWib(exam.startAt)}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {exam.counts.total}
                      </TableCell>
                      <TableCell className="text-center">
                        {exam.counts.graded}
                      </TableCell>
                      <TableCell className="text-center">
                        {exam.counts.submitted}
                      </TableCell>
                      <TableCell className="text-center">
                        {exam.counts.inProgress}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {exam.avgScore === null
                          ? "—"
                          : `${exam.avgScore} / ${exam.maxScore ?? "—"}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" asChild>
                          <Link href={`/teacher/reports/${exam.id}`}>
                            Lihat Detail
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {rangeStart}–{rangeEnd} dari {total} ujian
                </p>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Halaman {page} / {totalPages}
                  </span>

                  {page > 1 ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildHref(query, page - 1)}>
                        Sebelumnya
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Sebelumnya
                    </Button>
                  )}

                  {page < totalPages ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={buildHref(query, page + 1)}>Berikutnya</Link>
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
