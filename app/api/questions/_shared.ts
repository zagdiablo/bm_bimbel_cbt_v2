import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { HttpError, requireRole, type AuthUser } from "@/lib/auth-helpers";

/**
 * Semua endpoint Bank Soal memakai role union yang sama: TEACHER + ADMIN.
 * Scope data (ownerId) diterapkan terpisah lewat `questionScopeWhere`.
 */
export async function requireQuestionManager(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status },
    );
  }

  console.error("[api/questions]", error);

  return NextResponse.json(
    { message: "Terjadi kesalahan pada server" },
    { status: 500 },
  );
}

export function validationError(
  message: string,
  error: ZodError,
): NextResponse {
  return NextResponse.json(
    { message, errors: error.flatten().fieldErrors },
    { status: 400 },
  );
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}
