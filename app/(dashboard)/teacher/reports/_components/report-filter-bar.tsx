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
import { EXAM_STATUS_OPTIONS } from "@/lib/exams/labels";

const ALL = "all";

type SubjectOption = { id: string; name: string; code: string };

export function ReportFilterBar({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(currentSearch);

  const status = searchParams.get("status") ?? ALL;
  const subjectId = searchParams.get("subjectId") ?? ALL;
  const startFrom = searchParams.get("startFrom") ?? "";
  const startTo = searchParams.get("startTo") ?? "";
  const hasFilter =
    currentSearch !== "" ||
    status !== ALL ||
    subjectId !== ALL ||
    startFrom !== "" ||
    startTo !== "";

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

  function applyFilter(key: string, value: string) {
    replaceParams((params) => {
      if (value && value !== ALL) {
        params.set(key, value);
      } else {
        params.delete(key);
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
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="report-search"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Cari judul
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="report-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari judul ujian..."
              className="pl-9"
            />
            {isPending ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        <div className="w-[160px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={status}
            onValueChange={(value) => applyFilter("status", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua status</SelectItem>
              {EXAM_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[200px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Mata pelajaran
          </label>
          <Select
            value={subjectId}
            onValueChange={(value) => applyFilter("subjectId", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Semua mapel" />
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
        </div>

        <div className="w-[150px]">
          <label
            htmlFor="report-start-from"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Mulai dari
          </label>
          <Input
            id="report-start-from"
            type="date"
            value={startFrom}
            onChange={(event) =>
              applyFilter("startFrom", event.target.value)
            }
          />
        </div>

        <div className="w-[150px]">
          <label
            htmlFor="report-start-to"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Sampai
          </label>
          <Input
            id="report-start-to"
            type="date"
            value={startTo}
            onChange={(event) => applyFilter("startTo", event.target.value)}
          />
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
