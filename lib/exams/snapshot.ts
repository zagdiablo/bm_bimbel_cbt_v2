import type { ExamStatus, Prisma } from "@prisma/client";

import type { ExamSnapshot } from "@/lib/zod-schemas/exam";
import { examSnapshotSchema } from "@/lib/zod-schemas/exam";
import type { QuestionTypeValue } from "@/lib/zod-schemas/question";

/**
 * Kolom soal yang dibutuhkan untuk membangun snapshot. `deletedAt` ikut
 * diambil supaya publish bisa menolak soal yang sudah dihapus.
 */
export const snapshotQuestionSelect = {
  id: true,
  subjectId: true,
  type: true,
  questionText: true,
  explanation: true,
  difficulty: true,
  points: true,
  deletedAt: true,
  updatedAt: true,
  options: {
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: {
      label: true,
      text: true,
      isCorrect: true,
      order: true,
    },
  },
} satisfies Prisma.QuestionSelect;

export type SnapshotQuestion = Prisma.QuestionGetPayload<{
  select: typeof snapshotQuestionSelect;
}>;

export type ExamQuestionRecord = {
  id: string;
  order: number;
  pointsOverride: number | null;
  snapshotJson: unknown;
};

export type ExamQuestionWithSnapshot = ExamQuestionRecord & {
  /**
   * Status induk dipakai untuk menegakkan invariant: non-DRAFT wajib memakai
   * snapshot. Kalau tidak diberikan, keberadaan `snapshotJson` yang menentukan.
   */
  examStatus?: ExamStatus;
  question?: SnapshotQuestion | null;
};

type SnapshotOptionView = {
  label: string;
  text: string;
  order: number;
  isCorrect?: boolean;
};

export type ExamSnapshotView = Omit<
  ExamSnapshot,
  "options" | "explanation"
> & {
  explanation?: string | null;
  options: SnapshotOptionView[];
};

export type ExamQuestionView = {
  id: string;
  order: number;
  points: number;
  pointsOverride: number | null;
  source: "live" | "snapshot";
  sourceAvailable: boolean;
  snapshot: ExamSnapshotView | null;
};

export function buildExamSnapshot(
  question: SnapshotQuestion,
  capturedAt = new Date(),
): ExamSnapshot {
  return {
    version: 1,
    questionId: question.id,
    subjectId: question.subjectId,
    type: question.type,
    questionText: question.questionText,
    explanation: question.explanation,
    difficulty: question.difficulty,
    points: question.points,
    options: question.options.map((option) => ({
      label: option.label,
      text: option.text,
      isCorrect: option.isCorrect,
      order: option.order,
    })),
    capturedAt: capturedAt.toISOString(),
    sourceUpdatedAt: question.updatedAt.toISOString(),
  };
}

/**
 * Validasi ketat untuk data yang dibaca dari database. Unknown fields
 * diabaikan oleh Zod (forward-compatible), tetapi field wajib tetap dicek.
 */
export function parseExamSnapshot(json: unknown): ExamSnapshot {
  const parsed = examSnapshotSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `Snapshot ujian tidak valid: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return parsed.data;
}

/**
 * Memeriksa integritas kunci jawaban snapshot per tipe soal. Publish memakai
 * fungsi ini supaya Fase 7 tidak perlu memvalidasi ulang data bank.
 */
export function snapshotAnswerIssues(snapshot: ExamSnapshot): string[] {
  const issues: string[] = [];
  const options = snapshot.options;

  if (options.some((option) => option.label.trim() === "")) {
    issues.push("Label opsi tidak boleh kosong");
  }

  const labels = new Set<string>();

  for (const option of options) {
    const normalized = option.label.trim().toLowerCase();

    if (labels.has(normalized)) {
      issues.push(`Label opsi "${option.label}" duplikat`);
    }

    labels.add(normalized);

    if (option.text.trim() === "") {
      issues.push(`Teks opsi "${option.label}" kosong`);
    }
  }

  const correctCount = options.filter((option) => option.isCorrect).length;

  switch (snapshot.type as QuestionTypeValue) {
    case "SINGLE_CHOICE":
      if (options.length < 2) {
        issues.push("Pilihan ganda tunggal minimal memiliki 2 opsi");
      }

      if (correctCount !== 1) {
        issues.push("Pilihan ganda tunggal harus memiliki tepat 1 kunci jawaban");
      }
      break;

    case "MULTIPLE_CHOICE":
      if (options.length < 2) {
        issues.push("Pilihan ganda kompleks minimal memiliki 2 opsi");
      }

      if (correctCount < 1) {
        issues.push("Pilihan ganda kompleks minimal memiliki 1 kunci jawaban");
      }
      break;

    case "TRUE_FALSE":
      if (options.length !== 2) {
        issues.push("Soal benar/salah harus memiliki tepat 2 opsi");
      }

      if (correctCount !== 1) {
        issues.push("Soal benar/salah harus memiliki tepat 1 kunci jawaban");
      }
      break;

    case "SHORT_ANSWER": {
      const answers = options.filter((option) => option.isCorrect);

      if (answers.length < 1) {
        issues.push("Jawaban singkat minimal memiliki 1 kunci jawaban");
      }

      if (answers.some((answer) => answer.text.trim() === "")) {
        issues.push("Kunci jawaban singkat tidak boleh kosong");
      }
      break;
    }

    case "ESSAY":
      break;
  }

  return issues;
}

function toSnapshotView(
  snapshot: ExamSnapshot,
  forStudent: boolean,
): ExamSnapshotView {
  const { explanation, options, ...rest } = snapshot;

  return {
    ...rest,
    ...(forStudent ? {} : { explanation }),
    options: options.map((option) => {
      if (forStudent) {
        return {
          label: option.label,
          text: option.text,
          order: option.order,
        };
      }

      return {
        label: option.label,
        text: option.text,
        order: option.order,
        isCorrect: option.isCorrect,
      };
    }),
  };
}

/**
 * Satu-satunya mapper dari baris `ExamQuestion` ke bentuk yang dikirim API.
 *
 * - DRAFT  → materialisasi snapshot dari soal live (agar draft selalu fresh).
 * - non-DRAFT → wajib membaca `snapshotJson`; tidak pernah fallback ke live.
 * - forStudent: true → buang `explanation` dan `options[].isCorrect`.
 */
export function toExamQuestionView(
  examQuestion: ExamQuestionWithSnapshot,
  options: { forStudent: boolean },
): ExamQuestionView {
  const useSnapshot =
    examQuestion.examStatus !== undefined
      ? examQuestion.examStatus !== "DRAFT"
      : examQuestion.snapshotJson !== null &&
        examQuestion.snapshotJson !== undefined;

  if (useSnapshot) {
    const snapshot = parseExamSnapshot(examQuestion.snapshotJson);

    return {
      id: examQuestion.id,
      order: examQuestion.order,
      points: examQuestion.pointsOverride ?? snapshot.points,
      pointsOverride: examQuestion.pointsOverride,
      source: "snapshot",
      sourceAvailable: true,
      snapshot: toSnapshotView(snapshot, options.forStudent),
    };
  }

  if (!examQuestion.question) {
    return {
      id: examQuestion.id,
      order: examQuestion.order,
      points: examQuestion.pointsOverride ?? 0,
      pointsOverride: examQuestion.pointsOverride,
      source: "live",
      sourceAvailable: false,
      snapshot: null,
    };
  }

  const snapshot = buildExamSnapshot(examQuestion.question);

  return {
    id: examQuestion.id,
    order: examQuestion.order,
    points: examQuestion.pointsOverride ?? snapshot.points,
    pointsOverride: examQuestion.pointsOverride,
    source: "live",
    sourceAvailable: true,
    snapshot: toSnapshotView(snapshot, options.forStudent),
  };
}
