import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireRole, type AuthUser } from "@/lib/auth-helpers";
import { apiError } from "@/lib/api";

export { apiError, readJsonBody, validationError } from "@/lib/api";

/**
 * Semua endpoint mapel memakai role union yang sama dengan Bank Soal.
 * Mapel adalah domain bersama; tidak ada scope `ownerId`.
 */
export async function requireSubjectManager(): Promise<AuthUser> {
  return requireRole(["TEACHER", "ADMIN"]);
}

export function subjectConflict(
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    details ? { message, details } : { message },
    { status: 409 },
  );
}

/**
 * Mapping Prisma lokal supaya perilaku endpoint lain yang memakai `apiError`
 * global tidak berubah. P2003 pada DELETE ditangani di route agar bisa
 * menghitung ulang `details`; helper ini menangani P2002/P2025.
 */
export function subjectApiError(error: unknown): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return subjectConflict("Kode mapel sudah dipakai");
    }

    if (error.code === "P2025") {
      return NextResponse.json(
        { message: "Mapel tidak ditemukan" },
        { status: 404 },
      );
    }
  }

  return apiError(error, "api/subjects");
}
