import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExamAnalytics } from "@/lib/analytics/query";
import { filterAnalyticsItems } from "@/lib/analytics/stats";
import { requirePageRole } from "@/lib/auth-helpers";
import { getExamForReport } from "@/lib/reports/query";
import { normalizeSearchParams } from "@/lib/search-params";
import { analyticsQuerySchema } from "@/lib/zod-schemas/analytics";

import { ExamStatusBadge } from "../../../exams/_components/status-badge";
import { ReportTabs } from "../_components/report-tabs";
import { AnalyticsFilterBar } from "./_components/analytics-filter-bar";
import { AnalyticsSummaryCards } from "./_components/analytics-summary";
import { ItemAnalyticsTable } from "./_components/item-analytics-table";

export const metadata: Metadata = {
  title: "Analisis Butir Soal",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExamAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: SearchParams;
}) {
  const user = await requirePageRole(
    ["TEACHER", "ADMIN"],
    "/teacher/reports",
  );
  const { examId } = await params;
  const exam = await getExamForReport(examId, user);

  if (!exam) {
    notFound();
  }

  const parsed = analyticsQuerySchema.safeParse(
    normalizeSearchParams(await searchParams),
  );
  const filters = parsed.success ? parsed.data : {};
  const analytics = await getExamAnalytics(examId);
  const items = filterAnalyticsItems(analytics.items, filters);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/teacher/reports">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke laporan
          </Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ExamStatusBadge status={exam.status} />
          <span>
            {exam.subject.name} ({exam.subject.code})
          </span>
          <span>·</span>
          <span>Guru: {exam.owner.name}</span>
        </div>
      </div>

      <ReportTabs examId={examId} />

      <AnalyticsSummaryCards summary={analytics.summary} />

      <Suspense
        fallback={
          <Card>
            <CardContent className="h-[61px] animate-pulse p-3" />
          </Card>
        }
      >
        <AnalyticsFilterBar />
      </Suspense>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Analisis per soal ({items.length} dari{" "}
            {analytics.summary.totalQuestions} soal)
          </CardTitle>
          <CardDescription>
            p-value = proporsi benar dari attempt GRADED. D-index = selisih
            proporsi benar kelompok 27% atas dan bawah berdasarkan skor
            objektif. Esai tidak dihitung D-index.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemAnalyticsTable items={items} />
          {analytics.summary.sample.truncated ? (
            <p className="mt-3 flex items-start gap-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              D-index memakai {analytics.summary.sample.size} attempt teratas
              dari total {analytics.summary.sample.totalGraded} attempt GRADED.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
