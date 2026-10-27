import { requireRole, type AuthUser } from "@/lib/auth-helpers";

export { apiError, readJsonBody, validationError } from "@/lib/api";

/**
 * Semua endpoint Bank Soal memakai role union yang sama: TEACHER + ADMIN.
 * Scope data (ownerId) diterapkan terpisah lewat `questionScopeWhere`.
 */
export async function requireQuestionManager(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}
