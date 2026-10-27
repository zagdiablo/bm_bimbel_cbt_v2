import { z } from "zod";

/**
 * Nilai literal ini identik dengan enum Prisma `AttemptStatus`. Schema tidak
 * mengimpor `@prisma/client` supaya aman dipakai di client component.
 */
export const ATTEMPT_STATUSES = [
  "IN_PROGRESS",
  "SUBMITTED",
  "GRADED",
] as const;

export const attemptStatusSchema = z.enum(ATTEMPT_STATUSES);

export const joinAttemptSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Token ujian wajib diisi")
      .max(32, "Token ujian tidak valid"),
  })
  .strict();

const MAX_TEXT_ANSWER_LENGTH = 20_000;
const MAX_LABELS = 26;
const MAX_LABEL_LENGTH = 10;

const selectedLabelsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Label jawaban tidak boleh kosong")
      .max(MAX_LABEL_LENGTH, "Label jawaban terlalu panjang"),
  )
  .max(MAX_LABELS, `Maksimal ${MAX_LABELS} label jawaban`)
  .superRefine((labels, ctx) => {
    const seen = new Set<string>();

    labels.forEach((label, index) => {
      if (seen.has(label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "Label jawaban tidak boleh duplikat",
        });
      }

      seen.add(label);
    });
  });

/**
 * Satu payload bisa berisi `selectedLabels` ATAU `textAnswer`, tidak keduanya.
 * `baseRevision` adalah versi jawaban yang dipegang client:
 * - 0 berarti belum ada Answer.
 * - > 0 harus sama dengan `Answer.revision` di server.
 */
export const answerInputSchema = z
  .object({
    baseRevision: z
      .number({ invalid_type_error: "baseRevision harus berupa angka" })
      .int("baseRevision harus bilangan bulat")
      .min(0, "baseRevision tidak boleh negatif"),
    selectedLabels: selectedLabelsSchema.optional(),
    textAnswer: z
      .string()
      .max(MAX_TEXT_ANSWER_LENGTH, "Jawaban terlalu panjang")
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasLabels = value.selectedLabels !== undefined;
    const hasText = value.textAnswer !== undefined;

    if (hasLabels === hasText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: "Kirim salah satu: selectedLabels atau textAnswer",
      });
    }
  });

export type AttemptStatusValue = z.infer<typeof attemptStatusSchema>;
export type JoinAttemptInput = z.infer<typeof joinAttemptSchema>;
export type AnswerInput = z.infer<typeof answerInputSchema>;
