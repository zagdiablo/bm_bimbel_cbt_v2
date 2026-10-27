import { Check } from "lucide-react";

import type { ItemAnalytics } from "@/lib/analytics/types";
import { cn } from "@/lib/utils";

/**
 * Bar chart kecil tanpa library. Persentase selalu terhadap seluruh attempt
 * GRADED; untuk MULTIPLE_CHOICE total bisa > 100%.
 */
export function ResponseDistribution({ item }: { item: ItemAnalytics }) {
  if (item.distribution.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const maxCount = Math.max(1, ...item.distribution.map((entry) => entry.count));
  const isChoice =
    item.type === "SINGLE_CHOICE" ||
    item.type === "MULTIPLE_CHOICE" ||
    item.type === "TRUE_FALSE";

  return (
    <div className="flex min-w-48 flex-col gap-1.5">
      {item.distribution.map((entry) => (
        <div key={entry.key} className="flex items-center gap-2">
          <span
            className={cn(
              "w-28 shrink-0 truncate text-xs",
              entry.isCorrect && "font-semibold",
            )}
            title={entry.label}
          >
            {isChoice ? `${entry.key}. ${entry.label}` : entry.label}
            {entry.isCorrect ? (
              <Check className="ml-1 inline h-3 w-3 text-emerald-600" />
            ) : null}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className={cn(
                "h-full",
                entry.isCorrect ? "bg-emerald-500/70" : "bg-primary/60",
              )}
              style={{
                width: `${(entry.count / maxCount) * 100}%`,
                minWidth: entry.count > 0 ? "3px" : "0",
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums">
            {entry.count}
            {entry.percentage === null ? "" : ` (${entry.percentage}%)`}
          </span>
        </div>
      ))}
      {item.multiSelect ? (
        <span className="text-[11px] text-muted-foreground">
          Multi-pilih: total persentase bisa &gt; 100%.
        </span>
      ) : null}
    </div>
  );
}
