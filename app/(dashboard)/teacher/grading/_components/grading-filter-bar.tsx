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

const ALL = "all";

type ExamOption = { id: string; title: string };

export function GradingFilterBar({ exams }: { exams: ExamOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(currentSearch);
  const examId = searchParams.get("examId") ?? ALL;
  const hasFilter = currentSearch !== "" || examId !== ALL;

  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  function replaceParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());

    mutate(params);
    params.delete("page");

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  function applyExam(value: string) {
    replaceParams((params) => {
      if (value && value !== ALL) {
        params.set("examId", value);
      } else {
        params.delete("examId");
      }
    });
  }

  useEffect(() => {
    if (search === currentSearch) {
      return;
    }

    const timer = window.setTimeout(() => {
      replaceParams((params) => {
        if (search.trim()) {
          params.set("search", search.trim());
        } else {
          params.delete("search");
        }
      });
    }, 300);

    return () => window.clearTimeout(timer);
    // replaceParams membaca searchParams terbaru; dependency sengaja dibatasi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentSearch]);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[240px] flex-1">
          <label
            htmlFor="grading-search"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Cari nama siswa
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="grading-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama siswa..."
              className="pl-9"
            />
            {isPending ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        <div className="w-[300px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Ujian
          </label>
          <Select value={examId} onValueChange={applyExam}>
            <SelectTrigger>
              <SelectValue placeholder="Semua ujian" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua ujian</SelectItem>
              {exams.map((exam) => (
                <SelectItem key={exam.id} value={exam.id}>
                  {exam.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilter ? (
          <Button variant="ghost" asChild>
            <button
              type="button"
              onClick={() => router.replace(pathname, { scroll: false })}
            >
              <X className="h-4 w-4" />
              Reset
            </button>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
