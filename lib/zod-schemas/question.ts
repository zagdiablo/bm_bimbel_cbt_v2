import { z } from "zod";

/**
 * Schema ini sengaja tidak mengimpor `@prisma/client` supaya aman dipakai di
 * client component (form) maupun di server (API, import Fase 3). Nilai literal
 * di bawah identik dengan enum Prisma.
 */
export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
] as const;

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export const questionTypeSchema = z.enum(QUESTION_TYPES);
export const difficultySchema = z.enum(DIFFICULTIES);

export const OPTION_LABEL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const MAX_QUESTION_LENGTH = 20_000;
const MAX_EXPLANATION_LENGTH = 20_000;
const MAX_OPTION_LENGTH = 2_000;
const MAX_OPTIONS = 26;

const optionInputSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Label opsi wajib diisi")
      .max(10, "Label opsi maksimal 10 karakter"),
    text: z
      .string()
      .trim()
      .min(1, "Teks opsi wajib diisi")
      .max(MAX_OPTION_LENGTH, "Teks opsi terlalu panjang"),
    isCorrect: z.boolean(),
  })
  .strict();

/**
 * Opsi pilihan ganda divalidasi lewat `superRefine` pada array (bukan pada
 * object), sehingga tiap varian discriminated union tetap berupa ZodObject.
 */
function choiceOptions(correctness: "exactly-one" | "at-least-one") {
  return z
    .array(optionInputSchema)
    .min(2, "Minimal 2 opsi jawaban")
    .max(MAX_OPTIONS, `Maksimal ${MAX_OPTIONS} opsi jawaban`)
    .superRefine((options, ctx) => {
      const labels = new Set<string>();

      options.forEach((option, index) => {
        const label = option.label.trim().toLowerCase();

        if (labels.has(label)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "label"],
            message: "Label opsi harus unik",
          });
        }

        labels.add(label);
      });

      const correctCount = options.filter((option) => option.isCorrect).length;

      if (correctness === "exactly-one" && correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message:
            "Pilihan ganda tunggal harus memiliki tepat 1 kunci jawaban",
        });
      }

      if (correctness === "at-least-one" && correctCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [],
          message:
            "Pilihan ganda kompleks harus memiliki minimal 1 kunci jawaban",
        });
      }
    });
}

function shortAnswersSchema() {
  return z
    .array(
      z
        .string()
        .trim()
        .min(1, "Jawaban benar tidak boleh kosong")
        .max(MAX_OPTION_LENGTH, "Jawaban benar terlalu panjang"),
    )
    .min(1, "Minimal 1 jawaban benar")
    .max(MAX_OPTIONS, `Maksimal ${MAX_OPTIONS} jawaban benar`)
    .superRefine((answers, ctx) => {
      const seen = new Set<string>();

      answers.forEach((answer, index) => {
        const normalized = answer.toLowerCase();

        if (seen.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message: "Jawaban benar tidak boleh duplikat",
          });
        }

        seen.add(normalized);
      });
    });
}

const questionBaseShape = {
  subjectId: z.string().trim().min(1, "Mata pelajaran wajib dipilih"),
  questionText: z
    .string()
    .trim()
    .min(1, "Teks soal wajib diisi")
    .max(MAX_QUESTION_LENGTH, "Teks soal terlalu panjang"),
  explanation: z
    .string()
    .trim()
    .max(MAX_EXPLANATION_LENGTH, "Pembahasan terlalu panjang")
    .optional(),
  difficulty: difficultySchema,
  points: z
    .number({ invalid_type_error: "Poin harus berupa angka" })
    .int("Poin harus bilangan bulat")
    .min(1, "Poin minimal 1")
    .max(1_000, "Poin maksimal 1000"),
};

/**
 * `strict()` di setiap varian menolak field milik tipe lain, misalnya
 * `{ type: "SINGLE_CHOICE", correctAnswer: true }` → 400, bukan di-strip
 * diam-diam. Ini yang membuat kontrak API tegas untuk Fase 3 (import).
 */
export const questionInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...questionBaseShape,
      type: z.literal("SINGLE_CHOICE"),
      options: choiceOptions("exactly-one"),
    })
    .strict(),
  z
    .object({
      ...questionBaseShape,
      type: z.literal("MULTIPLE_CHOICE"),
      options: choiceOptions("at-least-one"),
    })
    .strict(),
  z
    .object({
      ...questionBaseShape,
      type: z.literal("TRUE_FALSE"),
      correctAnswer: z.boolean({
        invalid_type_error: "Kunci jawaban benar/salah wajib diisi",
      }),
    })
    .strict(),
  z
    .object({
      ...questionBaseShape,
      type: z.literal("SHORT_ANSWER"),
      correctAnswers: shortAnswersSchema(),
    })
    .strict(),
  z
    .object({
      ...questionBaseShape,
      type: z.literal("ESSAY"),
    })
    .strict(),
]);

export const questionListQuerySchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  type: questionTypeSchema.optional(),
  difficulty: difficultySchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const questionExportFormatSchema = z.enum(["xlsx", "pdf"]);

/**
 * Export memakai filter yang sama dengan list, tetapi tanpa pagination.
 * `format` wajib supaya endpoint tidak pernah menebak jenis file.
 */
export const questionExportQuerySchema = z.object({
  format: questionExportFormatSchema,
  subjectId: z.string().trim().min(1).optional(),
  type: questionTypeSchema.optional(),
  difficulty: difficultySchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export type QuestionTypeValue = z.infer<typeof questionTypeSchema>;
export type DifficultyValue = z.infer<typeof difficultySchema>;
export type QuestionOptionInput = z.infer<typeof optionInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionListQuery = z.infer<typeof questionListQuerySchema>;
export type QuestionExportFormat = z.infer<typeof questionExportFormatSchema>;
export type QuestionExportQuery = z.infer<typeof questionExportQuerySchema>;
