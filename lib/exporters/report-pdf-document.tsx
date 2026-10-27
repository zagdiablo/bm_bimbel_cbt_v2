import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { formatDuration, formatWib } from "@/lib/exams/datetime";
import { formatExportDateLong } from "@/lib/exporters/shared";
import { ATTEMPT_STATUS_LABEL } from "@/lib/reports/labels";
import type {
  ReportAttemptItem,
  ReportExam,
  ReportSummary,
} from "@/lib/reports/types";

export type ResultsPdfDocumentProps = {
  exam: ReportExam;
  stats: ReportSummary;
  attempts: readonly ReportAttemptItem[];
  userName: string;
  generatedAt: Date;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 40,
    paddingHorizontal: 36,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#111827",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    marginBottom: 2,
  },
  examTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 3,
  },
  meta: {
    fontSize: 8,
    color: "#4b5563",
    marginTop: 1,
  },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  summaryItem: {
    backgroundColor: "#f3f4f6",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e5e7eb",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#9ca3af",
    paddingVertical: 3,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 3,
  },
  rowAlt: {
    backgroundColor: "#f9fafb",
  },
  cell: {
    fontSize: 7,
    paddingHorizontal: 2,
  },
  cellHeader: {
    fontSize: 7,
    paddingHorizontal: 2,
  },
  alignRight: {
    textAlign: "right",
  },
  alignCenter: {
    textAlign: "center",
  },
  empty: {
    marginTop: 16,
    fontSize: 9,
    color: "#6b7280",
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#6b7280",
    textAlign: "right",
  },
});

const WIDTHS = {
  no: 22,
  name: 130,
  classroom: 62,
  started: 80,
  submitted: 80,
  status: 62,
  late: 30,
  total: 30,
  max: 26,
  percentage: 40,
  gradedAt: 80,
  gradedBy: 80,
} as const;

function HeaderCell({
  children,
  width,
  align,
}: {
  children: string;
  width: number;
  align?: "right" | "center";
}): ReactElement {
  return (
    <Text
      style={[
        styles.cellHeader,
        { width },
        align === "right"
          ? styles.alignRight
          : align === "center"
            ? styles.alignCenter
            : {},
      ]}
    >
      {children}
    </Text>
  );
}

function BodyCell({
  children,
  width,
  align,
}: {
  children: string;
  width: number;
  align?: "right" | "center";
}): ReactElement {
  return (
    <Text
      style={[
        styles.cell,
        { width },
        align === "right"
          ? styles.alignRight
          : align === "center"
            ? styles.alignCenter
            : {},
      ]}
    >
      {children}
    </Text>
  );
}

function formatScore(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function ResultsPdfDocument({
  exam,
  stats,
  attempts,
  userName,
  generatedAt,
}: ResultsPdfDocumentProps): ReactElement<DocumentProps> {
  return (
    <Document
      title={`Hasil Ujian - ${exam.title}`}
      author={userName}
      subject={exam.subject.name}
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>Hasil Ujian</Text>
          <Text style={styles.examTitle}>{exam.title}</Text>
          <Text style={styles.meta}>
            {exam.subject.name} ({exam.subject.code}) · {exam.status} · Guru:{" "}
            {exam.owner.name}
          </Text>
          <Text style={styles.meta}>
            Jadwal: {formatWib(exam.startAt)} – {formatWib(exam.endAt)} · Durasi{" "}
            {formatDuration(exam.durationMinutes)}
          </Text>
          <Text style={styles.meta}>
            Dicetak oleh: {userName} · {formatExportDateLong(generatedAt)}
          </Text>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryItem}>
            Total attempt: {stats.totalAttempts}
          </Text>
          <Text style={styles.summaryItem}>
            Sedang berjalan: {stats.byStatus.inProgress}
          </Text>
          <Text style={styles.summaryItem}>
            Menunggu penilaian: {stats.byStatus.submitted}
          </Text>
          <Text style={styles.summaryItem}>
            Sudah dinilai: {stats.byStatus.graded}
          </Text>
          <Text style={styles.summaryItem}>
            Rata-rata: {formatScore(stats.graded.avgScore)}
          </Text>
          <Text style={styles.summaryItem}>
            Terendah: {formatScore(stats.graded.minScore)}
          </Text>
          <Text style={styles.summaryItem}>
            Tertinggi: {formatScore(stats.graded.maxScore)}
          </Text>
          <Text style={styles.summaryItem}>
            Rata-rata persentase:{" "}
            {stats.graded.avgPercentage === null
              ? "—"
              : `${stats.graded.avgPercentage}%`}
          </Text>
        </View>

        <View style={styles.tableHeader} fixed>
          <HeaderCell width={WIDTHS.no} align="center">
            No
          </HeaderCell>
          <HeaderCell width={WIDTHS.name}>Nama Siswa</HeaderCell>
          <HeaderCell width={WIDTHS.classroom}>Kelas</HeaderCell>
          <HeaderCell width={WIDTHS.started}>Mulai</HeaderCell>
          <HeaderCell width={WIDTHS.submitted}>Submit</HeaderCell>
          <HeaderCell width={WIDTHS.status}>Status</HeaderCell>
          <HeaderCell width={WIDTHS.late} align="center">
            Late
          </HeaderCell>
          <HeaderCell width={WIDTHS.total} align="right">
            Total
          </HeaderCell>
          <HeaderCell width={WIDTHS.max} align="right">
            Max
          </HeaderCell>
          <HeaderCell width={WIDTHS.percentage} align="right">
            %
          </HeaderCell>
          <HeaderCell width={WIDTHS.gradedAt}>Graded At</HeaderCell>
          <HeaderCell width={WIDTHS.gradedBy}>Graded By</HeaderCell>
        </View>

        {attempts.length === 0 ? (
          <Text style={styles.empty}>Belum ada attempt pada ujian ini.</Text>
        ) : (
          attempts.map((attempt, index) => (
            <View
              key={attempt.id}
              style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]}
              wrap={false}
            >
              <BodyCell width={WIDTHS.no} align="center">
                {String(index + 1)}
              </BodyCell>
              <BodyCell width={WIDTHS.name}>{attempt.student.name}</BodyCell>
              <BodyCell width={WIDTHS.classroom}>
                {attempt.student.classroom ?? "Tanpa Kelas"}
              </BodyCell>
              <BodyCell width={WIDTHS.started}>
                {formatWib(attempt.startedAt)}
              </BodyCell>
              <BodyCell width={WIDTHS.submitted}>
                {attempt.submittedAt ? formatWib(attempt.submittedAt) : "—"}
              </BodyCell>
              <BodyCell width={WIDTHS.status}>
                {ATTEMPT_STATUS_LABEL[attempt.status]}
              </BodyCell>
              <BodyCell width={WIDTHS.late} align="center">
                {attempt.submittedAt
                  ? attempt.isLate
                    ? "Ya"
                    : "Tidak"
                  : "—"}
              </BodyCell>
              <BodyCell width={WIDTHS.total} align="right">
                {formatScore(attempt.totalScore)}
              </BodyCell>
              <BodyCell width={WIDTHS.max} align="right">
                {String(attempt.maxScore)}
              </BodyCell>
              <BodyCell width={WIDTHS.percentage} align="right">
                {attempt.percentage === null ? "—" : `${attempt.percentage}%`}
              </BodyCell>
              <BodyCell width={WIDTHS.gradedAt}>
                {attempt.gradedAt ? formatWib(attempt.gradedAt) : "—"}
              </BodyCell>
              <BodyCell width={WIDTHS.gradedBy}>
                {attempt.gradedBy?.name ?? "—"}
              </BodyCell>
            </View>
          ))
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Halaman ${pageNumber} dari ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
