import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ReportExportButtons({
  examId,
  filterQuery,
  total,
}: {
  examId: string;
  filterQuery: string;
  total: number;
}) {
  const suffix = filterQuery ? `&${filterQuery}` : "";
  const title = `Export ${total} attempt (filter aktif)`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a
          href={`/api/reports/${examId}/export?format=xlsx${suffix}`}
          title={title}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export XLSX
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a
          href={`/api/reports/${examId}/export?format=pdf${suffix}`}
          title={title}
        >
          <FileText className="h-4 w-4" />
          Export PDF
        </a>
      </Button>
      <span className="text-xs text-muted-foreground">
        PDF maks 500 baris; gunakan XLSX untuk data lengkap.
      </span>
    </div>
  );
}
