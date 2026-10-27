"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type SubjectForDelete = {
  id: string;
  name: string;
  code: string;
  _count: { questions: number; exams: number };
};

type DeleteResponse = {
  message?: string;
  details?: { questionCount?: number; examCount?: number };
};

export function DeleteSubjectDialog({
  subject,
}: {
  subject: SubjectForDelete;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conflict, setConflict] = useState<{
    questionCount: number;
    examCount: number;
  } | null>(null);

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDeleting(true);
    setConflict(null);

    try {
      const response = await fetch(`/api/subjects/${subject.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | DeleteResponse
        | null;

      if (response.status === 409) {
        // Jangan silent fail: tampilkan count dari server (fallback ke _count
        // yang sudah dirender di tabel).
        setConflict({
          questionCount:
            data?.details?.questionCount ?? subject._count.questions,
          examCount: data?.details?.examCount ?? subject._count.exams,
        });
        return;
      }

      if (!response.ok) {
        toast({
          title: "Gagal menghapus mapel",
          description: data?.message ?? "Terjadi kesalahan pada server.",
          variant: "destructive",
        });
        return;
      }

      setOpen(false);
      toast({
        title: "Mapel dihapus",
        description: `Mapel ${subject.code} sudah dihapus permanen.`,
      });
      router.refresh();
    } catch {
      toast({
        title: "Gagal menghapus mapel",
        description: "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          setConflict(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label={`Hapus mapel ${subject.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus mapel ini?</AlertDialogTitle>
          <AlertDialogDescription>
            “{subject.name}” ({subject.code}) akan dihapus permanen. Tindakan ini
            tidak bisa dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflict ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Tidak bisa menghapus mapel</AlertTitle>
            <AlertDescription>
              Mapel ini masih dipakai oleh {conflict.questionCount} soal dan{" "}
              {conflict.examCount} ujian. Hapus atau pindahkan data terkait
              terlebih dahulu.
            </AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {conflict ? "Tutup" : "Batal"}
          </AlertDialogCancel>
          {conflict ? null : (
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menghapus...
                </>
              ) : (
                "Hapus"
              )}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
