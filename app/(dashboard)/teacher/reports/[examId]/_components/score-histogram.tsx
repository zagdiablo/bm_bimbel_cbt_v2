import type { HistogramBin } from "@/lib/reports/types";

export function ScoreHistogram({ bins }: { bins: readonly HistogramBin[] }) {
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Distribusi Nilai</p>
        <p className="text-xs text-muted-foreground">
          {total === 0
            ? "Belum ada attempt yang dinilai"
            : `${total} attempt dinilai`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {bins.map((bin) => (
          <div key={bin.bin} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
              {bin.label}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full bg-primary/80"
                style={{
                  width: `${(bin.count / maxCount) * 100}%`,
                  minWidth: bin.count > 0 ? "4px" : "0",
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-xs font-medium">
              {bin.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
