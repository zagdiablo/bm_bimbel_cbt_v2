import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

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
import { listSubjectsWithStats } from "@/lib/subjects/query";
import {
  subjectListQuerySchema,
  type SubjectListQuery,
} from "@/lib/zod-schemas/subject";

import { DeleteSubjectDialog } from "./_components/delete-subject-dialog";
import { SubjectSearch } from "./_components/subject-search";
import {
  CreateSubjectDialog,
  EditSubjectDialog,
} from "./_components/subject-form-dialog";

export const metadata: Metadata = {
  title: "Mapel",
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

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePageRole(["TEACHER", "ADMIN"], "/teacher/subjects");

  const rawParams = await searchParams;
  const parsed = subjectListQuerySchema.safeParse(normalizeParams(rawParams));
  const query: SubjectListQuery = parsed.success
    ? parsed.data
    : subjectListQuerySchema.parse({});

  const subjects = await listSubjectsWithStats(query);
  const hasSearch = Boolean(query.search);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mapel</h1>
          <p className="text-muted-foreground">
            Mata pelajaran bersama untuk soal dan ujian. Semua guru dan admin
            melihat daftar yang sama.
          </p>
        </div>

        <CreateSubjectDialog />
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[74px] animate-pulse p-4" />
          </Card>
        }
      >
        <SubjectSearch />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {subjects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
              <p className="text-base font-medium">
                {hasSearch
                  ? "Tidak ada mapel yang cocok"
                  : "Belum ada mapel di database"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {hasSearch
                  ? "Coba kata kunci lain atau reset pencarian untuk melihat semua mapel."
                  : "Tambahkan mapel pertama agar dropdown Bank Soal dan Ujian bisa dipakai."}
              </p>

              {hasSearch ? (
                <Button variant="outline" asChild>
                  <Link href="/teacher/subjects">Reset pencarian</Link>
                </Button>
              ) : (
                <CreateSubjectDialog />
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead className="w-[100px] text-center">
                      Soal
                    </TableHead>
                    <TableHead className="w-[100px] text-center">
                      Ujian
                    </TableHead>
                    <TableHead className="w-[100px] text-right">
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {subject.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {subject.name}
                      </TableCell>
                      <TableCell
                        className="text-center"
                        title="Termasuk soal yang sudah diarsipkan"
                      >
                        {subject._count.questions}
                      </TableCell>
                      <TableCell className="text-center">
                        {subject._count.exams}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <EditSubjectDialog subject={subject} />
                          <DeleteSubjectDialog subject={subject} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t px-4 py-3 text-sm text-muted-foreground">
                Menampilkan {subjects.length} mapel. Angka soal/ujian termasuk
                data yang sudah diarsipkan.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
