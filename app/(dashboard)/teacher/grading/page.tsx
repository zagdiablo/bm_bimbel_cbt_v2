import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import {
  listGradingExamOptions,
  listPendingGrading,
} from "@/lib/grading/query";
import type { GradingListQuery } from "@/lib/grading/types";
import { gradingListQuerySchema } from "@/lib/zod-schemas/grading";

import { GradingFilterBar } from "./_components/grading-filter-bar";
import { SweptAttemptsToast } from "./_components/swept-attempts-toast";

export const metadata: Metadata = {
  title: "Penilaian Esai",
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

function buildHref(query: GradingListQuery, page: number): string {
  const params = new URLSearchParams();

  if (query.examId) params.set("examId", query.examId);
  if (query.search) params.set("search", query.search);
  params.set("page", String(page));

  return `/teacher/grading?${params.toString()}`;
}

export default async function GradingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/grading",
  );
  const rawParams = await searchParams;
  const parsed = gradingListQuerySchema.safeParse(normalizeParams(rawParams));
  const query: GradingListQuery = parsed.success
    ? parsed.data
    : gradingListQuerySchema.parse({});

  const [result, exams] = await Promise.all([
    listPendingGrading(user, query),
    listGradingExamOptions(user),
  ]);

  const { items, total, page, pageSize, swept } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilter = Boolean(query.search || query.examId);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Penilaian Esai
        </h1>
        <p className="text-muted-foreground">
          {user.role === "ADMIN"
            ? "Anda melihat attempt yang menunggu nilai dari semua guru."
            : "Anda melihat attempt yang menunggu nilai untuk ujian milik Anda."}
        </p>
      </div>

      <SweptAttemptsToast swept={swept} />

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[74px] animate-pulse p-4" />
          </Card>
        }
      >
        <GradingFilterBar exams={exams} />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground" />
              <p className="text-base font-medium">
                {hasFilter
                  ? "Tidak ada attempt yang cocok dengan filter"
                  : "Tidak ada attempt yang menunggu penilaian"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasFilter
                  ? "Coba ubah filter atau reset untuk melihat semua attempt."
                  : "Attempt akan muncul di sini setelah siswa submit ujian yang memiliki soal esai."}
              </p>

              {hasFilter ? (
                <Button variant="outline" asChild>
                  <Link href="/teacher/grading">Reset filter</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Siswa</TableHead>
                    <TableHead>Ujian</TableHead>
                    <TableHead className="w-[190px]">Dikumpulkan</TableHead>
                    <TableHead className="w-[120px] text-center">Esai</TableHead>
                    <TableHead className="w-[130px] text-center">Nilai</TableHead>
                    <TableHead className="w-[110px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.student.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.student.classroom ?? "Tanpa kelas"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.examTitle}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.subject.name} ({item.subject.code})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">
                            {formatWib(item.submittedAt)}
                          </span>
                          {item.isLate ? (
                            <Badge
                              variant="destructive"
                              className="w-fit text-[10px]"
                            >
                              Terlambat
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {item.pendingEssayCount}/{item.essayCount} belum
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.totalScore === null
                          ? "—"
                          : `${item.totalScore} / ${item.maxScore}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.integrityError ? (
                          <div className="flex items-center justify-end gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            Data rusak
                          </div>
                        ) : (
                          <Button size="sm" asChild>
                            <Link href={`/teacher/grading/${item.id}`}>
                              Nilai
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {rangeStart}–{rangeEnd} dari {total} attempt
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
