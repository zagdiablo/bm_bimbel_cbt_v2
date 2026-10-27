import type { Role } from "@prisma/client";

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  TEACHER: "Guru",
  STUDENT: "Siswa",
};

export function isRole(value: unknown): value is Role {
  return value === "ADMIN" || value === "TEACHER" || value === "STUDENT";
}

export function homePathForRole(role: string | null | undefined): string {
  return isRole(role) ? ROLE_HOME[role] : ROLE_HOME.STUDENT;
}

/**
 * Only same-origin, absolute-path redirects are allowed. This blocks
 * `//evil.example` and `https://evil.example` style open redirects.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
