import { requireRole, type AuthUser } from "@/lib/auth-helpers";

export {
  apiError,
  HttpError,
  readJsonBody,
  validationError,
} from "@/lib/api";

export async function requireGrader(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}
