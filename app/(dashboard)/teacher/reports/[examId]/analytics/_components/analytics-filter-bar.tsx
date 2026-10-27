"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ITEM_DIFFICULTY_LABEL } from "@/lib/analytics/labels";
import { QUESTION_TYPE_OPTIONS } from "@/lib/questions/labels";

const ALL = "all";

export function AnalyticsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const type = searchParams.get("type") ?? ALL;
  const difficulty = searchParams.get("difficulty") ?? ALL;
  const hasFilter = type !== ALL || difficulty !== ALL;

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Filter className="h-3.5 w-3.5" />
          )}
          Filter
        </span>

        <Select
          value={type}
          onValueChange={(value) => applyFilter("type", value)}
        >
          <SelectTrigger className="h-9 w-44" aria-label="Filter tipe soal">
            <SelectValue placeholder="Semua tipe" />
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
          <SelectTrigger className="h-9 w-44" aria-label="Filter kesulitan">
            <SelectValue placeholder="Semua kesulitan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua kesulitan</SelectItem>
            {(["EASY", "MEDIUM", "HARD"] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {ITEM_DIFFICULTY_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              startTransition(() => {
                router.replace(pathname, { scroll: false });
              });
            }}
          >
            Reset filter
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
