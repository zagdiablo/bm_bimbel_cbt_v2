import { z } from "zod";

import { questionInputSchema } from "@/lib/zod-schemas/question";

import {
  summarizeQuestions,
  type ImportSummary,
  type ImportFileTypeValue,
  type ParsedQuestion,
} from "./types";

export const parsedQuestionSchema = z.object({
  rowNumber: z.number().int().positive(),
  data: questionInputSchema.nullable(),
  errors: z.array(z.string()),
});

export const previewPayloadSchema = z.object({
  version: z.literal(1),
  parsedAt: z.string(),
  meta: z.object({
    filename: z.string(),
    fileType: z.enum(["XLSX", "DOCX", "PDF"]),
    defaultSubjectId: z.string().optional(),
  }),
  questions: z.array(parsedQuestionSchema),
  globalErrors: z.array(z.string()),
});

export type PreviewPayload = z.infer<typeof previewPayloadSchema>;

export type BuildPreviewInput = {
  filename: string;
  fileType: ImportFileTypeValue;
  defaultSubjectId?: string;
  questions: ParsedQuestion[];
  globalErrors: string[];
};

export function buildPreviewPayload(input: BuildPreviewInput): PreviewPayload {
  return {
    version: 1,
    parsedAt: new Date().toISOString(),
    meta: {
      filename: input.filename,
      fileType: input.fileType,
      ...(input.defaultSubjectId
        ? { defaultSubjectId: input.defaultSubjectId }
        : {}),
    },
    questions: input.questions,
    globalErrors: input.globalErrors,
  };
}

export function parsePreviewPayload(value: unknown): PreviewPayload | null {
  const parsed = previewPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function previewSummary(preview: PreviewPayload): ImportSummary {
  return summarizeQuestions(preview.questions);
}

export function serializePreviewForPrisma(preview: PreviewPayload): unknown {
  // JSON.stringify membuang field undefined dan memastikan bentuk JSON murni
  // sebelum disimpan ke kolom Prisma Json.
  return JSON.parse(JSON.stringify(preview)) as unknown;
}
