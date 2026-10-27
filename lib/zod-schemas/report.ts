import { z } from "zod";

import { attemptStatusSchema } from "./attempt";
import { examStatusSchema } from "./exam";

const dateQuerySchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "Format tanggal tidak valid",
  )
  .optional();

export const reportListQuerySchema = z
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

/** Satu bentuk filter dipakai tabel, pagination, dan export. */
const reportAttemptFilterShape = {
  classroom: z.string().trim().max(100).optional(),
  status: attemptStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
};

export const reportDetailQuerySchema = z.object({
  ...reportAttemptFilterShape,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const reportExportQuerySchema = z.object({
  ...reportAttemptFilterShape,
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
});

export type ReportListQueryInput = z.infer<typeof reportListQuerySchema>;
export type ReportDetailQueryInput = z.infer<typeof reportDetailQuerySchema>;
export type ReportExportFormat = z.infer<
  typeof reportExportQuerySchema
>["format"];
