import { z } from "zod";

export const gradingListQuerySchema = z.object({
  examId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * `baseRevision` mengikuti semantik autosave Fase 6:
 * - 0 berarti belum ada Answer (essay kosong).
 * - > 0 harus sama dengan `Answer.revision`; kalau tidak, 409.
 */
export const questionScoreInputSchema = z
  .object({
    score: z
      .number({ invalid_type_error: "Nilai harus berupa angka" })
      .int("Nilai harus bilangan bulat")
      .min(0, "Nilai tidak boleh negatif"),
    baseRevision: z
      .number({ invalid_type_error: "baseRevision harus berupa angka" })
      .int("baseRevision harus bilangan bulat")
      .min(0, "baseRevision tidak boleh negatif"),
  })
  .strict();

export type GradingListQueryInput = z.infer<typeof gradingListQuerySchema>;
export type QuestionScoreInput = z.infer<typeof questionScoreInputSchema>;
