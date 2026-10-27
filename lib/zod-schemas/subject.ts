import { z } from "zod";

/**
 * Schema subject sengaja tidak mengimpor `@prisma/client` supaya aman dipakai
 * di client component (form) maupun di server (API). Nilai `code` divalidasi
 * case-insensitive; normalisasi ke uppercase dilakukan di server sebelum save.
 */
export const SUBJECT_CODE_PATTERN = /^[A-Z0-9_-]+$/i;

export const subjectInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nama mapel minimal 2 karakter")
      .max(100, "Nama mapel maksimal 100 karakter"),
    code: z
      .string()
      .trim()
      .min(2, "Kode mapel minimal 2 karakter")
      .max(20, "Kode mapel maksimal 20 karakter")
      .regex(
        SUBJECT_CODE_PATTERN,
        "Kode mapel hanya boleh huruf, angka, strip, dan underscore",
      ),
  })
  .strict();

/**
 * PATCH memakai pola yang sama dengan desain: `name` wajib (form edit selalu
 * pre-filled), `code` opsional. Ini menghindari body kosong dan error
 * root-level yang tidak muncul di `fieldErrors`.
 */
export const subjectUpdateSchema = subjectInputSchema
  .extend({
    code: subjectInputSchema.shape.code.optional(),
  })
  .strict();

export const subjectListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  // `withStats` sengaja literal "1" — `z.coerce.boolean()` akan menganggap
  // string "0"/"false" sebagai true.
  withStats: z.literal("1").optional(),
});

export type SubjectInput = z.infer<typeof subjectInputSchema>;
export type SubjectUpdate = z.infer<typeof subjectUpdateSchema>;
export type SubjectListQuery = z.infer<typeof subjectListQuerySchema>;
