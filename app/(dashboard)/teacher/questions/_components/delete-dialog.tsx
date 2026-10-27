"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

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

type DeleteDialogProps = {
  questionId: string;
  questionText: string;
};

export function DeleteDialog({
  questionId,
  questionText,
}: DeleteDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDeleting(true);

    try {
      const response = await fetch(`/api/questions/${questionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        toast({
          title: "Gagal menghapus soal",
          description: data?.message ?? "Terjadi kesalahan pada server.",
          variant: "destructive",
        });
        return;
      }

      setOpen(false);
      toast({
        title: "Soal dihapus",
        description: "Soal dipindahkan ke soft-delete dan tidak tampil di daftar.",
      });
      router.refresh();
    } catch {
      toast({
        title: "Gagal menghapus soal",
        description: "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  const preview =
    questionText.length > 120
      ? `${questionText.slice(0, 120)}…`
      : questionText;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label="Hapus soal"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus soal ini?</AlertDialogTitle>
          <AlertDialogDescription>
            “{preview}” akan di-soft-delete (kolom <code>deletedAt</code> diisi)
            dan hilang dari daftar. Data tetap tersimpan di database.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
