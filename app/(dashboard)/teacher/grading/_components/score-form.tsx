"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type ScoreFormProps = {
  attemptId: string;
  examQuestionId: string;
  endpoint: "essays" | "short-answers";
  points: number;
  score: number | null;
  baseRevision: number;
  disabled?: boolean;
  disabledReason?: string;
  /** True jika menyimpan nilai ini akan menyelesaikan penilaian attempt. */
  willFinalize?: boolean;
};

export function ScoreForm({
  attemptId,
  examQuestionId,
  endpoint,
  points,
  score,
  baseRevision,
  disabled = false,
  disabledReason,
  willFinalize = false,
}: ScoreFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState(score === null ? "" : String(score));
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setValue(score === null ? "" : String(score));
  }, [score]);

  function validate(): number | null {
    const parsed = Number(value);

    if (value.trim() === "" || !Number.isInteger(parsed)) {
      toast({
        title: "Nilai tidak valid",
        description: "Masukkan bilangan bulat.",
        variant: "destructive",
      });
      return null;
    }

    if (parsed < 0 || parsed > points) {
      toast({
        title: "Nilai di luar rentang",
        description: `Nilai harus antara 0 dan ${points}.`,
        variant: "destructive",
      });
      return null;
    }

    return parsed;
  }

  async function save() {
    const parsed = validate();

    if (parsed === null) {
      return;
    }

    setSaving(true);
    setConfirmOpen(false);

    try {
      const response = await fetch(
        `/api/grading/${attemptId}/${endpoint}/${examQuestionId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ score: parsed, baseRevision }),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        attempt?: { status?: string };
      } | null;

      if (!response.ok) {
        toast({
          title: "Gagal menyimpan nilai",
          description: data?.message ?? "Terjadi kesalahan pada server.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title:
          data?.attempt?.status === "GRADED"
            ? "Penilaian selesai"
            : "Nilai tersimpan",
        description:
          data?.attempt?.status === "GRADED"
            ? "Semua esai sudah dinilai. Attempt sekarang berstatus GRADED."
            : "Nilai dan total sementara sudah diperbarui.",
      });
      router.refresh();
    } catch {
      toast({
        title: "Gagal menyimpan nilai",
        description: "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validate() === null) {
      return;
    }

    if (willFinalize) {
      setConfirmOpen(true);
      return;
    }

    void save();
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="w-28">
          <label
            htmlFor={`score-${examQuestionId}`}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Nilai (0–{points})
          </label>
          <Input
            id={`score-${examQuestionId}`}
            type="number"
            min={0}
            max={points}
            step={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={disabled || saving}
          />
        </div>

        <Button type="submit" size="sm" disabled={disabled || saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {willFinalize ? "Simpan & selesaikan" : "Simpan nilai"}
            </>
          )}
        </Button>
      </form>

      {disabled && disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan penilaian attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              Ini adalah esai terakhir yang belum dinilai. Setelah disimpan,
              attempt akan berstatus GRADED. Perubahan nilai esai setelahnya
              hanya dapat dilakukan oleh admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void save();
              }}
              disabled={saving}
            >
              Simpan & selesaikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
