import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-helpers";
import {
  expireStaleImportJobs,
  findImportJobForUser,
} from "@/lib/importers/jobs";
import {
  parsePreviewPayload,
  previewSummary,
} from "@/lib/importers/preview";
import { listSubjects } from "@/lib/questions/query";

import { PreviewTable } from "../_components/preview-table";

export const metadata: Metadata = {
  title: "Preview Import Soal",
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

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/questions/import",
  );
  const { jobId } = await params;

  await expireStaleImportJobs(user.id);
  const job = await findImportJobForUser(jobId, user.id);

  if (!job) {
    notFound();
  }

  const preview = parsePreviewPayload(job.previewJson);
  const subjects = await listSubjects();
  const subjectNames = Object.fromEntries(
    subjects.map((subject) => [subject.id, subject.name]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Link
          href="/teacher/questions/import"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Import Soal
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Preview Import
          </h1>
          <Badge variant={STATUS_VARIANT[job.status]}>
            {STATUS_LABEL[job.status]}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {job.filename} · {job.fileType} · diunggah{" "}
          {formatDate(job.createdAt)}
        </p>
      </div>

      {!preview ? (
        <Alert variant="destructive">
          <AlertTitle>Preview tidak dapat dibaca</AlertTitle>
          <AlertDescription>
            Data preview job ini rusak. Silakan upload ulang file.
          </AlertDescription>
        </Alert>
      ) : null}

      {job.status === "COMMITTED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Import selesai
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {job.createdCount} soal berhasil dibuat
              {job.committedAt
                ? ` pada ${formatDate(job.committedAt)}`
                : ""}.
            </p>
            <Button asChild>
              <Link href="/teacher/questions">Buka Bank Soal</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {job.status === "EXPIRED" ? (
        <Alert>
          <AlertTitle>Preview sudah kedaluwarsa</AlertTitle>
          <AlertDescription>
            Job import berlaku 1 jam. File sudah dihapus; silakan upload ulang.
          </AlertDescription>
        </Alert>
      ) : null}

      {job.status === "FAILED" ? (
        <Alert variant="destructive">
          <AlertTitle>Import gagal diproses</AlertTitle>
          <AlertDescription>
            {preview?.globalErrors.join(" ") ??
              "File tidak dapat diparse. Periksa format lalu upload ulang."}
          </AlertDescription>
        </Alert>
      ) : null}

      {preview && job.status === "PENDING_PREVIEW" ? (
        <PreviewTable
          jobId={job.id}
          questions={preview.questions}
          summary={previewSummary(preview)}
          globalErrors={preview.globalErrors}
          subjectNames={subjectNames}
        />
      ) : null}
    </div>
  );
}
