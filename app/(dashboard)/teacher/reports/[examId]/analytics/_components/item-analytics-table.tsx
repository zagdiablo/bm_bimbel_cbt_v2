import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ITEM_DIFFICULTY_LABEL,
  ITEM_DISCRIMINATION_LABEL,
} from "@/lib/analytics/labels";
import type { ItemAnalytics } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

import { ResponseDistribution } from "./response-distribution";

function metricText(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function difficultyClass(difficulty: ItemAnalytics["difficultyCategory"]) {
  if (difficulty === "EASY") return "border-emerald-600/40 text-emerald-700";
  if (difficulty === "HARD") return "border-rose-600/40 text-rose-700";
  if (difficulty === "MEDIUM") return "border-amber-600/40 text-amber-700";

  return "";
}

function discriminationClass(
  category: ItemAnalytics["discriminationCategory"],
) {
  if (category === "GOOD") return "border-emerald-600/40 text-emerald-700";
  if (category === "POOR") return "border-rose-600/40 text-rose-700";
  if (category === "FAIR") return "border-amber-600/40 text-amber-700";

  return "";
}

function dIndexHint(item: ItemAnalytics): string {
  if (item.type === "ESSAY") {
    return "D-index tidak dihitung untuk soal esai";
  }

  if (item.integrityError) {
    return item.integrityError;
  }

  return "Sample < 10 attempt GRADED: D-index tidak dihitung";
}

export function ItemAnalyticsTable({ items }: { items: ItemAnalytics[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        Tidak ada soal yang cocok dengan filter.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-right">#</TableHead>
            <TableHead className="w-32">Tipe</TableHead>
            <TableHead className="min-w-64">Soal</TableHead>
            <TableHead className="w-20 text-right">p-value</TableHead>
            <TableHead className="w-24">Kesulitan</TableHead>
            <TableHead className="w-20 text-right">D-index</TableHead>
            <TableHead className="w-24">Daya Pembeda</TableHead>
            <TableHead className="min-w-64">Distribusi</TableHead>
            <TableHead className="w-24 text-right">Skip</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const skipText =
              item.skipRate === null
                ? "—"
                : `${Math.round(item.skipRate * 100)}% (${item.skipCount})`;

            return (
              <TableRow key={item.examQuestionId} className="align-top">
                <TableCell className="text-right text-xs text-muted-foreground">
                  {item.order}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium">{item.typeLabel}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {item.points} poin
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <p
                    className="line-clamp-2 max-w-96 text-sm"
                    title={item.questionText}
                  >
                    {item.questionText}
                  </p>
                  {item.integrityError ? (
                    <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {item.integrityError}
                    </p>
                  ) : null}
                  {item.questionTextTruncated ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Teks dipotong untuk tampilan.
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {metricText(item.pValue)}
                </TableCell>
                <TableCell>
                  {item.difficultyCategory ? (
                    <Badge
                      variant="outline"
                      className={cn(difficultyClass(item.difficultyCategory))}
                    >
                      {ITEM_DIFFICULTY_LABEL[item.difficultyCategory]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {item.discrimination === null ? (
                    <span
                      className="text-muted-foreground"
                      title={dIndexHint(item)}
                    >
                      —
                    </span>
                  ) : (
                    item.discrimination.toFixed(2)
                  )}
                </TableCell>
                <TableCell>
                  {item.discriminationCategory ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        discriminationClass(item.discriminationCategory),
                      )}
                    >
                      {ITEM_DISCRIMINATION_LABEL[item.discriminationCategory]}
                    </Badge>
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      title={dIndexHint(item)}
                    >
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ResponseDistribution item={item} />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {skipText}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
