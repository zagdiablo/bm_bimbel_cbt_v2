import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/api";

/**
 * Re-export agar import lama (`from "@/lib/auth-helpers"`) tetap berjalan.
 * Definisi class sekarang ada di `lib/api.ts` supaya route API bisa memakainya
 * tanpa menarik modul auth/Next headers.
 */
export { HttpError };

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
}

/**
 * Session lookup is wrapped in React `cache` so a layout and a page in the
 * same request do not hit the database twice.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();

  if (!session?.user) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role as Role,
    classroom: (session.user.classroom as string | null | undefined) ?? null,
  };
});

/**
 * `currentUser` is an optional injection point for tests and for callers that
 * already resolved the session. Production callers should omit it.
 */
export async function requireAuth(
  currentUser?: AuthUser | null,
): Promise<AuthUser> {
  const user = currentUser === undefined ? await getCurrentUser() : currentUser;

  if (!user) {
    throw new HttpError(401, "Anda harus masuk terlebih dahulu");
  }

  return user;
}

export async function requireRole(
  roles: readonly Role[],
  currentUser?: AuthUser | null,
): Promise<AuthUser> {
  const user = await requireAuth(currentUser);

  if (!roles.includes(user.role)) {
    throw new HttpError(403, "Anda tidak memiliki akses ke resource ini");
  }

  return user;
}

/**
 * Server-component guard: redirects instead of throwing so the user lands on
 * a usable page rather than an error boundary.
 */
export async function requirePageRole(
  roles: readonly Role[],
  currentPath = "/dashboard",
): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  if (!roles.includes(user.role)) {
    redirect("/403");
  }

  return user;
}
