import type { AttemptStatus, ExamStatus } from "@prisma/client";

export type ReportExamSubject = {
  id: string;
  name: string;
  code: string;
};

export type ReportExamOwner = {
  id: string;
  name: string;
};

/** Filter list laporan. `startFrom`/`startTo` memakai `Exam.startAt`. */
export type ReportListQuery = {
  status?: ExamStatus;
  subjectId?: string;
  search?: string;
  startFrom?: string;
  startTo?: string;
  page: number;
  pageSize: number;
};

/** Filter baris attempt di dalam satu exam. */
export type ReportAttemptFilters = {
  /** Nama kelas persis, atau `REPORT_NO_CLASSROOM` untuk `classroom = null`. */
  classroom?: string;
  status?: AttemptStatus;
  search?: string;
};

export type ReportDetailQuery = ReportAttemptFilters & {
  page: number;
  pageSize: number;
};

export type ReportAttemptCounts = {
  total: number;
  inProgress: number;
  submitted: number;
  graded: number;
};

export type ReportExamItem = {
  id: string;
  title: string;
  subject: ReportExamSubject;
  status: ExamStatus;
  startAt: string | null;
  endAt: string | null;
  counts: ReportAttemptCounts;
  /** Rata-rata `totalScore` attempt GRADED; null bila belum ada yang dinilai. */
  avgScore: number | null;
  /** `Attempt.maxScore` (seragam untuk satu exam karena snapshot immutable). */
  maxScore: number | null;
};

export type ReportExam = {
  id: string;
  title: string;
  subject: ReportExamSubject;
  owner: ReportExamOwner;
  status: ExamStatus;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number;
  /** Hanya dikirim ke TEACHER/ADMIN (STUDENT sudah diblokir di level role). */
  token: string | null;
  showResult: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  /** Audit aktor publish/close; null untuk exam sebelum Fase 9. */
  publishedBy: ReportExamOwner | null;
  closedBy: ReportExamOwner | null;
};

export type HistogramBin = {
  /** 1..5, urut dari nilai terendah. */
  bin: number;
  label: string;
  min: number;
  max: number;
  count: number;
};

export type ReportGradedSummary = {
  count: number;
  avgScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  /** Rata-rata persentase attempt GRADED (0..100, 1 desimal). */
  avgPercentage: number | null;
};

export type ReportSummary = {
  totalAttempts: number;
  byStatus: {
    inProgress: number;
    submitted: number;
    graded: number;
  };
  graded: ReportGradedSummary;
  histogram: HistogramBin[];
  /** Jumlah attempt yang masuk histogram; harus sama dengan `graded.count`. */
  histogramTotal: number;
  /** GRADED dengan `totalScore` null atau `maxScore` <= 0 (data rusak). */
  invalidScores: number;
};

export type ReportAttemptItem = {
  id: string;
  student: {
    id: string;
    name: string;
    classroom: string | null;
  };
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  receivedAt: string | null;
  gradedAt: string | null;
  gradedBy: ReportExamOwner | null;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  isLate: boolean;
};

export type ReportAttemptList = {
  items: ReportAttemptItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ReportDetail = {
  exam: ReportExam;
  stats: ReportSummary;
  classrooms: (string | null)[];
  attempts: ReportAttemptList;
};
