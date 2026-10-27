import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Pencil, Plus } from "lucide-react";

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
import { formatDuration, formatWib } from "@/lib/exams/datetime";
import { listExams } from "@/lib/exams/query";
import { listSubjects } from "@/lib/questions/query";
import {
  examListQuerySchema,
  type ExamListQuery,
} from "@/lib/zod-schemas/exam";

import { DeleteExamDialog } from "./_components/delete-exam-dialog";
import { ExamFilterBar } from "./_components/exam-filter-bar";
import { ExamStatusBadge } from "./_components/status-badge";

export const metadata: Metadata = {
  title: "Manajemen Ujian",
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

function buildHref(query: ExamListQuery, page: number): string {
  const params = new URLSearchParams();

  if (query.status) params.set("status", query.status);
  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.search) params.set("search", query.search);
  if (query.startFrom) params.set("startFrom", query.startFrom);
  if (query.startTo) params.set("startTo", query.startTo);
  params.set("page", String(page));

  return `/teacher/exams?${params.toString()}`;
}

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/exams",
  );

  const rawParams = await searchParams;
  const parsed = examListQuerySchema.safeParse(normalizeParams(rawParams));
  const query: ExamListQuery = parsed.success
    ? parsed.data
    : examListQuerySchema.parse({});

  const [result, subjects] = await Promise.all([
    listExams(query, user),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manajemen Ujian</h1>
          <p className="text-muted-foreground">
            {user.role === "ADMIN"
              ? "Anda melihat ujian dari semua guru."
              : "Anda melihat ujian milik Anda sendiri."}
          </p>
        </div>

        <Button asChild>
          <Link href="/teacher/exams/new">
            <Plus className="h-4 w-4" />
            Buat Ujian
          </Link>
        </Button>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[98px] animate-pulse p-4" />
          </Card>
        }
      >
        <ExamFilterBar subjects={subjects} />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-base font-medium">
                {hasFilter
                  ? "Tidak ada ujian yang cocok dengan filter"
                  : "Belum ada ujian"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasFilter
                  ? "Coba ubah kata kunci atau reset filter untuk melihat semua ujian."
                  : "Buat draft ujian, pilih soal dari bank soal, lalu publikasikan saat jadwalnya siap."}
              </p>

              {hasFilter ? (
                <Button variant="outline" asChild>
                  <Link href="/teacher/exams">Reset filter</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/teacher/exams/new">
                    <Plus className="h-4 w-4" />
                    Buat Ujian
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul</TableHead>
                    <TableHead className="w-[150px]">Mapel</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[190px]">Jadwal</TableHead>
                    <TableHead className="w-[110px]">Durasi</TableHead>
                    <TableHead className="w-[70px] text-center">Soal</TableHead>
                    <TableHead className="w-[110px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((exam) => (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <div className="max-w-[360px]">
                          <p className="truncate font-medium" title={exam.title}>
                            {exam.title}
                          </p>
                          {user.role === "ADMIN" ? (
                            <p className="text-xs text-muted-foreground">
                              {exam.owner.name}
                            </p>
                          ) : null}
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
                      <TableCell className="text-sm">
                        {formatDuration(exam.durationMinutes)}
                      </TableCell>
                      <TableCell className="text-center">
                        {exam._count.questions}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            aria-label="Lihat detail ujian"
                          >
                            <Link href={`/teacher/exams/${exam.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {exam.status === "DRAFT" ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                aria-label="Edit ujian"
                              >
                                <Link href={`/teacher/exams/${exam.id}/edit`}>
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <DeleteExamDialog
                                examId={exam.id}
                                title={exam.title}
                              />
                            </>
                          ) : null}
                        </div>
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
                      <Link href={buildHref(query, page - 1)}>Sebelumnya</Link>
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
