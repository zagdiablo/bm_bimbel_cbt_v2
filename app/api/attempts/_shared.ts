import { requireRole, type AuthUser } from "@/lib/auth-helpers";

export {
  apiError,
  HttpError,
  readJsonBody,
  validationError,
} from "@/lib/api";

/**
 * Attempt adalah resource milik siswa. Middleware tidak mencakup `/api/*`,
 * jadi setiap route wajib memanggil guard ini.
 */
export async function requireStudent(): Promise<AuthUser> {
  return requireRole(["STUDENT"]);
}
