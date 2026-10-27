import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { listRecentImportJobs } from "@/lib/importers/jobs";
import { listSubjects } from "@/lib/questions/query";

import { UploadForm } from "./_components/upload-form";

export const metadata: Metadata = {
  title: "Import Soal",
};

const STATUS_LABEL = {
  PENDING_PREVIEW: "Menunggu commit",
  COMMITTED: "Selesai",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
} as const;

const STATUS_VARIANT = {
  PENDING_PREVIEW: "secondary",
  COMMITTED: "default",
  FAILED: "destructive",
  EXPIRED: "outline",
} as const;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function ImportQuestionsPage() {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/questions/import",
  );
  const [subjects, jobs] = await Promise.all([
    listSubjects(),
    listRecentImportJobs(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/teacher/questions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Bank Soal
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Import Soal</h1>
        <p className="text-muted-foreground">
          Upload XLSX, DOCX, atau PDF. Semua baris harus valid sebelum bisa
          di-commit; tidak ada commit parsial.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <UploadForm subjects={subjects} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riwayat import</CardTitle>
              <CardDescription>
                10 job terakhir. Preview dan file kedaluwarsa setelah 1 jam.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {jobs.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                  Belum ada riwayat import.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hasil</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {job.fileType === "XLSX" ? (
                              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p className="max-w-[260px] truncate font-medium">
                                {job.filename}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {job.fileType}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[job.status]}>
                            {STATUS_LABEL[job.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {job.status === "COMMITTED"
                            ? `${job.createdCount} soal dibuat`
                            : job.failedCount > 0
                              ? `${job.failedCount} invalid`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(job.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/teacher/questions/import/${job.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Detail
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                Template
              </CardTitle>
              <CardDescription>
                Gunakan template agar format kolom dan metadata sesuai parser.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <a
                href="/templates/template-import-soal.xlsx"
                download
                className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Template XLSX
              </a>
              <a
                href="/templates/template-import-soal.docx"
                download
                className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"
              >
                <FileText className="h-4 w-4" />
                Template DOCX
              </a>
              <a
                href="/templates/template-import-soal.pdf"
                download
                className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"
              >
                <FileText className="h-4 w-4" />
                Template PDF
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aturan penting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Maksimal 10MB dan 1.000 soal per file.</p>
              <p>• PDF harus text-based, bukan hasil scan.</p>
              <p>• DOCX/PDF memakai satu mapel dari form upload.</p>
              <p>• XLSX memakai subject_code per baris.</p>
              <p>• File disimpan sementara dan dihapus setelah commit/expiry.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
