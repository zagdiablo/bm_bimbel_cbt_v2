"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { QuestionExportFormat } from "@/lib/zod-schemas/question";

const FILTER_KEYS = ["subjectId", "type", "difficulty", "search"] as const;

function filenameFromDisposition(
  header: string | null,
  format: QuestionExportFormat,
): string {
  const match = header?.match(/filename="?([^";]+)"?/i);

  return match?.[1] ?? `soal.${format}`;
}

/**
 * Export memakai filter yang sedang aktif di URL. Download dilakukan lewat
 * fetch + Blob supaya respons 400 (mis. melebihi batas 2.000 soal) bisa
 * ditampilkan sebagai toast, bukan halaman error browser.
 */
export function ExportMenu() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pending, setPending] = useState<QuestionExportFormat | null>(null);

  async function download(format: QuestionExportFormat) {
    const params = new URLSearchParams({ format });

    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key);

      if (value) {
        params.set(key, value);
      }
    }

    setPending(format);

    try {
      const response = await fetch(
        `/api/questions/export?${params.toString()}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;

        throw new Error(body?.message ?? "Gagal mengekspor soal");
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
        format,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);

      toast({
        title: "Export selesai",
        description: filename,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export gagal",
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          aria-label="Export bank soal"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Export filter aktif</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending !== null}
          onSelect={() => void download("xlsx")}
        >
          XLSX (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending !== null}
          onSelect={() => void download("pdf")}
        >
          PDF (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
