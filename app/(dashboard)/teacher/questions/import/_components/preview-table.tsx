"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { useToast } from "@/hooks/use-toast";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
} from "@/lib/questions/labels";
import type { ImportSummary, ParsedQuestion } from "@/lib/importers/types";
import type { QuestionInput } from "@/lib/zod-schemas/question";
import { cn } from "@/lib/utils";

type PreviewTableProps = {
  jobId: string;
  questions: ParsedQuestion[];
  summary: ImportSummary;
  globalErrors: string[];
  subjectNames: Record<string, string>;
};

function AnswerDetail({ data }: { data: QuestionInput }) {
  switch (data.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return (
        <ul className="space-y-1">
          {data.options.map((option) => (
            <li key={option.label} className="flex items-start gap-2">
              <Badge variant={option.isCorrect ? "default" : "outline"}>
                {option.label}
              </Badge>
              <span>{option.text}</span>
              {option.isCorrect ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : null}
            </li>
          ))}
        </ul>
      );

    case "TRUE_FALSE":
      return (
        <p>
          Kunci:{" "}
          <strong>{data.correctAnswer ? "Benar" : "Salah"}</strong>
        </p>
      );

    case "SHORT_ANSWER":
      return (
        <div className="flex flex-wrap gap-1">
          {data.correctAnswers.map((answer) => (
            <Badge key={answer} variant="secondary">
              {answer}
            </Badge>
          ))}
        </div>
      );

    case "ESSAY":
      return <p className="text-muted-foreground">Tanpa kunci jawaban.</p>;
  }
}

export function PreviewTable({
  jobId,
  questions,
  summary,
  globalErrors,
  subjectNames,
}: PreviewTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canCommit =
    summary.valid > 0 && summary.invalid === 0 && globalErrors.length === 0;

  function toggle(rowNumber: number) {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }

      return next;
    });
  }

  async function handleCommit() {
    if (!canCommit || committing) {
      return;
    }

    setCommitting(true);
    setActionError(null);

    try {
      const response = await fetch("/api/questions/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importJobId: jobId }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        createdCount?: number;
      } | null;

      if (!response.ok) {
        setActionError(data?.message ?? "Gagal commit import.");
        return;
      }

      toast({
        title: "Import berhasil",
        description: `${data?.createdCount ?? summary.valid} soal masuk ke Bank Soal.`,
      });
      router.push("/teacher/questions");
      router.refresh();
    } catch {
      setActionError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setCommitting(false);
    }
  }

  async function handleCancel() {
    if (cancelling) {
      return;
    }

    setCancelling(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/questions/import/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setActionError(data?.message ?? "Gagal membatalkan import.");
        return;
      }

      toast({
        title: "Import dibatalkan",
        description: "File dan preview sudah dihapus.",
      });
      router.push("/teacher/questions/import");
      router.refresh();
    } catch {
      setActionError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total baris</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Valid</p>
            <p className="text-2xl font-semibold text-emerald-600">
              {summary.valid}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Invalid</p>
            <p className="text-2xl font-semibold text-destructive">
              {summary.invalid}
            </p>
          </CardContent>
        </Card>
      </div>

      {globalErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>File tidak dapat diproses</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {globalErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Commit gagal</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canCommit
            ? "Semua baris valid. Commit akan membuat seluruh soal sekaligus."
            : "Commit diblokir sampai semua baris valid. Tidak ada commit parsial."}
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={committing || cancelling}
          >
            {cancelling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Batalkan
          </Button>
          <Button
            type="button"
            onClick={handleCommit}
            disabled={!canCommit || committing || cancelling}
          >
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              "Commit semua soal"
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Preview soal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-36">Tipe</TableHead>
                <TableHead>Soal</TableHead>
                <TableHead className="w-32">Mapel</TableHead>
                <TableHead className="w-24">Poin</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question) => {
                const valid =
                  question.data !== null && question.errors.length === 0;
                const isOpen = expanded.has(question.rowNumber);

                return (
                  <Fragment key={question.rowNumber}>
                    <TableRow
                      className={cn(
                        !valid && "bg-destructive/5",
                        valid && "bg-emerald-50/40",
                      )}
                    >
                      <TableCell>{question.rowNumber}</TableCell>
                      <TableCell>
                        <Badge
                          variant={valid ? "secondary" : "destructive"}
                          className="gap-1"
                        >
                          {valid ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {valid ? "Valid" : "Invalid"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {question.data
                          ? QUESTION_TYPE_LABEL[question.data.type]
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <p
                          className="line-clamp-2 max-w-[520px]"
                          title={
                            question.data?.questionText ??
                            question.errors.join(" | ")
                          }
                        >
                          {question.data?.questionText ??
                            "Baris ini tidak dapat diparse"}
                        </p>
                        {!valid ? (
                          <ul className="mt-1 space-y-0.5 text-xs text-destructive">
                            {question.errors.map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {question.data
                          ? (subjectNames[question.data.subjectId] ?? "—")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {question.data ? (
                          <div className="space-y-1">
                            <span>{question.data.points}</span>
                            <Badge variant="outline">
                              {DIFFICULTY_LABEL[question.data.difficulty]}
                            </Badge>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {question.data ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => toggle(question.rowNumber)}
                            aria-label={
                              isOpen ? "Tutup detail" : "Lihat detail jawaban"
                            }
                          >
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 transition-transform",
                                isOpen && "rotate-90",
                              )}
                            />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>

                    {isOpen && question.data ? (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={7} className="px-6 py-3">
                          <div className="space-y-2 text-sm">
                            <AnswerDetail data={question.data} />
                            {question.data.explanation ? (
                              <p className="text-muted-foreground">
                                <strong>Pembahasan:</strong>{" "}
                                {question.data.explanation}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
