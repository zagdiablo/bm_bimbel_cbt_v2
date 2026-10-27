import { requireRole, type AuthUser } from "@/lib/auth-helpers";

export {
  apiError,
  HttpError,
  readJsonBody,
  validationError,
} from "@/lib/api";

/**
 * Report hanya untuk guru/admin. STUDENT ditolak `403`; request tanpa session
 * ditolak `401`. Scope data tetap diverifikasi per exam (`examScopeWhere`).
 */
export async function requireReporter(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}
