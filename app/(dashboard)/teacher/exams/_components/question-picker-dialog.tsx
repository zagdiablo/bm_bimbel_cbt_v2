"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/questions/labels";

import type { PickerQuestion } from "./types";

const PAGE_SIZE = 20;

type QuestionPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  selectedIds: string[];
  onApply: (ids: string[], loaded: PickerQuestion[]) => void;
};

type QuestionListResponse = {
  items: PickerQuestion[];
  total: number;
  page: number;
  pageSize: number;
};

export function QuestionPickerDialog({
  open,
  onOpenChange,
  subjectId,
  selectedIds,
  onApply,
}: QuestionPickerDialogProps) {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PickerQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<Map<string, PickerQuestion>>(new Map());

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCheckedIds(new Set(selectedIds));
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, [open, selectedIds]);

  useEffect(() => {
    if (searchInput === search) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    if (!open || !subjectId) {
      return;
    }

    const controller = new AbortController();

    async function load() {
      setLoading(true);

      try {
        const params = new URLSearchParams({
          subjectId,
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });

        if (search) {
          params.set("search", search);
        }

        const response = await fetch(`/api/questions?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Gagal memuat bank soal");
        }

        const body = (await response.json()) as QuestionListResponse;

        setItems(body.items);
        setTotal(body.total);
        setLoaded((previous) => {
          const next = new Map(previous);

          for (const item of body.items) {
            next.set(item.id, item);
          }

          return next;
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        toast({
          title: "Gagal memuat soal",
          description:
            error instanceof Error
              ? error.message
              : "Tidak dapat menghubungi server.",
          variant: "destructive",
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [open, subjectId, search, page, toast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggle(question: PickerQuestion) {
    setCheckedIds((previous) => {
      const next = new Set(previous);

      if (next.has(question.id)) {
        next.delete(question.id);
      } else {
        next.add(question.id);
      }

      return next;
    });

    setLoaded((current) => {
      if (current.has(question.id)) {
        return current;
      }

      const next = new Map(current);
      next.set(question.id, question);

      return next;
    });
  }

  function apply() {
    const ids = [...checkedIds].filter(
      (id) => loaded.has(id) || selectedIdSet.has(id),
    );

    onApply(ids, [...loaded.values()]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Pilih soal</DialogTitle>
          <DialogDescription>
            Soal diambil dari bank soal mata pelajaran ujian ini. Centang soal
            yang ingin dipakai, lalu atur urutan dan poin di halaman edit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari teks soal..."
              className="pl-9"
            />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border">
            {items.length === 0 && !loading ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                {search
                  ? "Tidak ada soal yang cocok dengan pencarian."
                  : "Belum ada soal di mapel ini."}
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((question) => {
                  const checked = checkedIds.has(question.id);

                  return (
                    <li key={question.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(question)}
                          className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm">
                            {question.questionText}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {QUESTION_TYPE_LABEL[question.type]}
                            </Badge>
                            <Badge variant="outline">
                              {DIFFICULTY_LABEL[question.difficulty]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {question.points} poin
                            </span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {checkedIds.size} soal dipilih
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Halaman {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={apply}>
            Terapkan ({checkedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
