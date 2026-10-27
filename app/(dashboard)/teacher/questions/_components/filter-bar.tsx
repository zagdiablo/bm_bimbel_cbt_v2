"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
} from "@/lib/questions/labels";

const ALL = "all";

type SubjectOption = { id: string; name: string; code: string };

/**
 * Filter berbasis URL (`?subjectId=&type=&difficulty=&search=&page=`).
 * State disimpan di query string supaya bisa di-bookmark, di-share, dan
 * dipakai ulang oleh halaman ujian (Fase 5) tanpa state global.
 */
export function FilterBar({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(currentSearch);

  const subjectId = searchParams.get("subjectId") ?? ALL;
  const type = searchParams.get("type") ?? ALL;
  const difficulty = searchParams.get("difficulty") ?? ALL;
  const hasFilter =
    currentSearch !== "" || subjectId !== ALL || type !== ALL || difficulty !== ALL;

  // Sinkron saat user memakai tombol back/forward atau mereset filter.
  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  function replaceParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // filter berubah → kembali ke halaman 1

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function applyFilter(key: string, value: string) {
    replaceParams((params) => {
      if (value && value !== ALL) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  // Search debounce 300ms.
  useEffect(() => {
    if (search === currentSearch) {
      return;
    }

    const timer = setTimeout(() => {
      replaceParams((params) => {
        const value = search.trim();

        if (value) {
          params.set("search", value);
        } else {
          params.delete("search");
        }
      });
    }, 300);

    return () => clearTimeout(timer);
    // `replaceParams` sengaja tidak masuk deps: ia membaca searchParams terbaru
    // pada saat timer berjalan, dan menambahkannya akan me-reset debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentSearch]);

  function resetFilters() {
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:min-w-[220px] sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari teks soal atau pembahasan..."
            className="pl-8"
            aria-label="Cari soal"
          />
        </div>

        <Select
          value={subjectId}
          onValueChange={(value) => applyFilter("subjectId", value)}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter mata pelajaran">
            <SelectValue placeholder="Mata pelajaran" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua mapel</SelectItem>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(value) => applyFilter("type", value)}>
          <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filter tipe soal">
            <SelectValue placeholder="Tipe soal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua tipe</SelectItem>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={difficulty}
          onValueChange={(value) => applyFilter("difficulty", value)}
        >
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter kesulitan">
            <SelectValue placeholder="Kesulitan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua tingkat</SelectItem>
            {DIFFICULTY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter ? (
          <Button
            type="button"
            variant="ghost"
            onClick={resetFilters}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
            Reset
          </Button>
        ) : null}

        {isPending ? (
          <Loader2
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-label="Memuat"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
