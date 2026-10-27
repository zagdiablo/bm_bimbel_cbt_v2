import { AlertTriangle, BarChart3, Layers, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ANALYTICS_WARNING_MESSAGE } from "@/lib/analytics/labels";
import type { AnalyticsSummary } from "@/lib/analytics/types";

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof BarChart3;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </CardContent>
    </Card>
  );
}

function countText(
  counts: Record<string, number>,
  keys: readonly string[],
): string {
  return keys.map((key) => `${counts[key] ?? 0}`).join(" / ");
}

export function AnalyticsSummaryCards({
  summary,
}: {
  summary: AnalyticsSummary;
}) {
  const { sample } = summary;

  return (
    <div className="flex flex-col gap-4">
      {summary.warnings.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Perhatian interpretasi</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc space-y-1">
              {summary.warnings.map((warning) => (
                <li key={warning}>{ANALYTICS_WARNING_MESSAGE[warning]}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sample Dinilai"
          value={String(summary.gradedAttempts)}
          description={
            summary.pendingAttempts > 0
              ? `${summary.pendingAttempts} attempt menunggu penilaian tidak dihitung`
              : sample.truncated
                ? `D-index memakai ${sample.size} attempt teratas`
                : sample.reliable
                  ? "Sample memadai untuk analisis butir"
                  : "Sample 10–29: interpretasi hati-hati"
          }
          icon={Users}
        />
        <StatCard
          label="Total Soal"
          value={String(summary.totalQuestions)}
          description={`${summary.objectiveQuestions} objektif · ${summary.essayQuestions} esai`}
          icon={Layers}
        />
        <StatCard
          label="Kesulitan (Mudah / Sedang / Sulit)"
          value={countText(summary.difficultyCounts, [
            "EASY",
            "MEDIUM",
            "HARD",
          ])}
          description="p-value > 0.70 / 0.30–0.70 / < 0.30"
          icon={BarChart3}
        />
        <StatCard
          label="Daya Pembeda (Baik / Cukup / Buruk)"
          value={countText(summary.discriminationCounts, [
            "GOOD",
            "FAIR",
            "POOR",
          ])}
          description={`${summary.notApplicableDiscrimination} soal tanpa D-index`}
          icon={BarChart3}
        />
      </div>
    </div>
  );
}
