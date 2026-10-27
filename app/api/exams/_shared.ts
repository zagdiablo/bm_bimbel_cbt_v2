import type { ExamStatus } from "@prisma/client";

import { HttpError } from "@/lib/api";
import { requireRole, type AuthUser } from "@/lib/auth-helpers";
import {
  findExamForUser,
  type ExamScopeUser,
} from "@/lib/exams/query";

export {
  apiError,
  HttpError,
  readJsonBody,
  validationError,
} from "@/lib/api";

export async function requireExamManager(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}

export function examScopeFor(user: AuthUser): ExamScopeUser {
  return { id: user.id, role: user.role };
}

export async function requireOwnedExam(id: string, user: AuthUser) {
  const exam = await findExamForUser(id, examScopeFor(user));

  if (!exam) {
    throw new HttpError(404, "Ujian tidak ditemukan");
  }

  return exam;
}

export function requireDraftStatus(status: ExamStatus): void {
  if (status !== "DRAFT") {
    throw new HttpError(
      400,
      "Hanya ujian berstatus draft yang dapat diubah atau dihapus",
    );
  }
}
