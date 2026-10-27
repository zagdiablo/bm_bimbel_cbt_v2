import { z } from "zod";

import { questionTypeSchema } from "./question";

export const analyticsQuerySchema = z.object({
  type: questionTypeSchema.optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
