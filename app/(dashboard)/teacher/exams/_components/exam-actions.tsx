"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Pencil, Send } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ExamStatusValue } from "@/lib/zod-schemas/exam";

import { DeleteExamDialog } from "./delete-exam-dialog";

type ExamActionsProps = {
  examId: string;
  title: string;
  status: ExamStatusValue;
  publishDisabled: boolean;
  publishDisabledReason: string | null;
};

export function ExamActions({
  examId,
  title,
  status,
  publishDisabled,
  publishDisabledReason,
}: ExamActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  async function publish() {
    setPublishing(true);

    try {
      const response = await fetch(`/api/exams/${examId}/publish`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        toast({
          title: "Gagal mempublikasikan ujian",
          description: body?.message ?? "Terjadi kesalahan pada server.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Ujian dipublikasikan",
        description: "Token sudah dibuat dan konten ujian dikunci.",
      });
      router.refresh();
    } catch {
      toast({
        title: "Gagal mempublikasikan ujian",
        description: "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function close() {
    setClosing(true);

    try {
      const response = await fetch(`/api/exams/${examId}/close`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        toast({
          title: "Gagal menutup ujian",
          description: body?.message ?? "Terjadi kesalahan pada server.",
          variant: "destructive",
        });
        return;
      }

      setCloseOpen(false);
      toast({
        title: "Ujian ditutup",
        description: "Siswa tidak dapat lagi mengakses ujian ini.",
      });
      router.refresh();
    } catch {
      toast({
        title: "Gagal menutup ujian",
        description: "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  }

  if (status === "DRAFT") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link href={`/teacher/exams/${examId}/edit`}>
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </Button>

        <Button
          type="button"
          onClick={() => void publish()}
          disabled={publishDisabled || publishing}
          title={publishDisabledReason ?? undefined}
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Mempublikasikan...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Publish
            </>
          )}
        </Button>

        <DeleteExamDialog
          examId={examId}
          title={title}
          redirectTo="/teacher/exams"
        />
      </div>
    );
  }

  if (status === "PUBLISHED") {
    return (
      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Lock className="h-4 w-4" />
            Tutup Ujian
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tutup ujian ini?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” akan berstatus CLOSED dan siswa tidak dapat lagi
              mengaksesnya. Status ini tidak dapat dibuka kembali, dan ujian
              tidak dapat dihapus karena histori attempt harus dilindungi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void close();
              }}
              disabled={closing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menutup...
                </>
              ) : (
                "Tutup Ujian"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return null;
}
