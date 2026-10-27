import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Upload } from "lucide-react";

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
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
} from "@/lib/questions/labels";
import { listQuestions, listSubjects } from "@/lib/questions/query";
import {
  questionListQuerySchema,
  type QuestionListQuery,
} from "@/lib/zod-schemas/question";

import { DeleteDialog } from "./_components/delete-dialog";
import { FilterBar } from "./_components/filter-bar";

export const metadata: Metadata = {
  title: "Bank Soal",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DIFFICULTY_VARIANT = {
  EASY: "secondary",
  MEDIUM: "outline",
  HARD: "destructive",
} as const;

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

function buildHref(query: QuestionListQuery, page: number): string {
  const params = new URLSearchParams();

  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.type) params.set("type", query.type);
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.search) params.set("search", query.search);
  params.set("page", String(page));

  return `/teacher/questions?${params.toString()}`;
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/questions",
  );

  const rawParams = await searchParams;
  const parsed = questionListQuerySchema.safeParse(normalizeParams(rawParams));
  const query: QuestionListQuery = parsed.success
    ? parsed.data
    : questionListQuerySchema.parse({});

  const [result, subjects] = await Promise.all([
    listQuestions(query, user),
    listSubjects(),
  ]);

  const { items, total, page, pageSize } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilter = Boolean(
    query.search || query.subjectId || query.type || query.difficulty,
  );
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Soal</h1>
          <p className="text-muted-foreground">
            {user.role === "ADMIN"
              ? "Anda melihat soal dari semua guru."
              : "Anda melihat soal milik Anda sendiri."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/teacher/questions/import">
              <Upload className="h-4 w-4" />
              Import Soal
            </Link>
          </Button>
          <Button asChild>
            <Link href="/teacher/questions/new">
              <Plus className="h-4 w-4" />
              Buat Soal
            </Link>
          </Button>
        </div>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[74px] animate-pulse p-4" />
          </Card>
        }
      >
        <FilterBar subjects={subjects} />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-base font-medium">
                {hasFilter
                  ? "Tidak ada soal yang cocok dengan filter"
                  : "Belum ada soal di bank soal"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasFilter
                  ? "Coba ubah kata kunci atau reset filter untuk melihat semua soal."
                  : "Mulai dengan membuat soal pertama. Semua tipe soal didukung: pilihan ganda, benar/salah, jawaban singkat, dan esai."}
              </p>

              {hasFilter ? (
                <Button variant="outline" asChild>
                  <Link href="/teacher/questions">Reset filter</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/teacher/questions/new">
                    <Plus className="h-4 w-4" />
                    Buat Soal
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Tipe</TableHead>
                    <TableHead>Soal</TableHead>
                    <TableHead className="w-[140px]">Mapel</TableHead>
                    <TableHead className="w-[100px]">Kesulitan</TableHead>
                    <TableHead className="w-[70px] text-center">Poin</TableHead>
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((question) => (
                    <TableRow key={question.id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {QUESTION_TYPE_LABEL[question.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p
                          className="line-clamp-2 max-w-[460px]"
                          title={question.questionText}
                        >
                          {question.questionText}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {question.subject.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={DIFFICULTY_VARIANT[question.difficulty]}
                        >
                          {DIFFICULTY_LABEL[question.difficulty]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {question.points}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            aria-label="Edit soal"
                          >
                            <Link
                              href={`/teacher/questions/${question.id}/edit`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <DeleteDialog
                            questionId={question.id}
                            questionText={question.questionText}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {rangeStart}–{rangeEnd} dari {total} soal
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
