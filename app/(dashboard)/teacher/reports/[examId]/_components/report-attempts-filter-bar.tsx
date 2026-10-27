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
  ATTEMPT_STATUS_LABEL,
  REPORT_NO_CLASSROOM,
  REPORT_NO_CLASSROOM_LABEL,
} from "@/lib/reports/labels";

const ALL = "all";

export function ReportAttemptsFilterBar({
  classrooms,
}: {
  classrooms: (string | null)[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(currentSearch);
  const classroom = searchParams.get("classroom") ?? ALL;
  const status = searchParams.get("status") ?? ALL;
  const hasFilter =
    currentSearch !== "" || classroom !== ALL || status !== ALL;

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
            htmlFor="report-student-search"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Cari siswa
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="report-student-search"
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

        <div className="w-[180px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Kelas
          </label>
          <Select
            value={classroom}
            onValueChange={(value) => applyFilter("classroom", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Semua kelas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua kelas</SelectItem>
              {classrooms.map((item) => (
                <SelectItem
                  key={item ?? REPORT_NO_CLASSROOM}
                  value={item ?? REPORT_NO_CLASSROOM}
                >
                  {item ?? REPORT_NO_CLASSROOM_LABEL}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[190px]">
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
              {(
                Object.keys(ATTEMPT_STATUS_LABEL) as (keyof typeof ATTEMPT_STATUS_LABEL)[]
              ).map((value) => (
                <SelectItem key={value} value={value}>
                  {ATTEMPT_STATUS_LABEL[value]}
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
