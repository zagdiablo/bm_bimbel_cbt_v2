import { z } from "zod";

import {
  difficultySchema,
  questionTypeSchema,
} from "@/lib/zod-schemas/question";

/**
 * Nilai literal ini identik dengan enum Prisma `ExamStatus`. Schema tidak
 * mengimpor `@prisma/client` supaya aman dipakai di client component.
 */
export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;

export const examStatusSchema = z.enum(EXAM_STATUSES);

const dateTimeStringSchema = z
  .string()
  .trim()
  .min(1, "Tanggal wajib diisi")
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Format tanggal tidak valid",
  );

const nullableDateTimeSchema = dateTimeStringSchema.nullable().optional();

export const examInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Judul ujian minimal 3 karakter")
      .max(200, "Judul ujian maksimal 200 karakter"),
    subjectId: z.string().trim().min(1, "Mata pelajaran wajib dipilih"),
    durationMinutes: z
      .number({ invalid_type_error: "Durasi harus berupa angka" })
      .int("Durasi harus bilangan bulat")
      .min(1, "Durasi minimal 1 menit")
      .max(480, "Durasi maksimal 480 menit"),
    startAt: nullableDateTimeSchema,
    endAt: nullableDateTimeSchema,
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    showResult: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.startAt || !value.endAt) {
      return;
    }

    if (Date.parse(value.startAt) >= Date.parse(value.endAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Waktu selesai harus setelah waktu mulai",
      });
    }
  });

const examQuestionItemSchema = z
  .object({
    questionId: z.string().trim().min(1, "Soal wajib dipilih"),
    pointsOverride: z
      .number({ invalid_type_error: "Poin override harus berupa angka" })
      .int("Poin override harus bilangan bulat")
      .min(1, "Poin override minimal 1")
      .max(1_000, "Poin override maksimal 1000")
      .nullable()
      .optional(),
  })
  .strict();

export const MAX_EXAM_QUESTIONS = 200;

export const examQuestionListSchema = z
  .object({
    questions: z
      .array(examQuestionItemSchema)
      .max(MAX_EXAM_QUESTIONS, `Maksimal ${MAX_EXAM_QUESTIONS} soal per ujian`),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.questions.forEach((item, index) => {
      if (seen.has(item.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "questionId"],
          message: "Soal tidak boleh dipilih lebih dari sekali",
        });
      }

      seen.add(item.questionId);
    });
  });

const dateQuerySchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Format tanggal tidak valid",
  )
  .optional();

export const examListQuerySchema = z
  .object({
    status: examStatusSchema.optional(),
    subjectId: z.string().trim().min(1).optional(),
    search: z.string().trim().max(200).optional(),
    startFrom: dateQuerySchema,
    startTo: dateQuerySchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((value, ctx) => {
    if (
      value.startFrom &&
      value.startTo &&
      Date.parse(value.startFrom) > Date.parse(value.startTo)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTo"],
        message: "Batas akhir tanggal tidak boleh sebelum batas awal",
      });
    }
  });

const snapshotOptionSchema = z.object({
  label: z.string().trim().min(1).max(10),
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
  order: z.number().int(),
});

/**
 * `z.object` (tanpa `strict`) sengaja dipakai agar field baru dari Fase 6/7
 * diabaikan, bukan membuat snapshot lama tidak terbaca.
 */
export const examSnapshotSchema = z.object({
  version: z.literal(1),
  questionId: z.string().min(1),
  subjectId: z.string().min(1),
  type: questionTypeSchema,
  questionText: z.string().trim().min(1),
  explanation: z.string().nullable(),
  difficulty: difficultySchema,
  points: z.number().int().min(1).max(1_000),
  options: z.array(snapshotOptionSchema),
  capturedAt: dateTimeStringSchema,
  sourceUpdatedAt: dateTimeStringSchema,
});

export type ExamStatusValue = z.infer<typeof examStatusSchema>;
export type ExamInput = z.infer<typeof examInputSchema>;
export type ExamListQuery = z.infer<typeof examListQuerySchema>;
export type ExamQuestionInput = z.infer<typeof examQuestionItemSchema>;
export type ExamQuestionListInput = z.infer<typeof examQuestionListSchema>;
export type ExamSnapshot = z.infer<typeof examSnapshotSchema>;
