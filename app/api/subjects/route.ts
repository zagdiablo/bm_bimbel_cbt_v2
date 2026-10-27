import { NextResponse } from "next/server";

import { HttpError, requireRole } from "@/lib/auth-helpers";
import { listSubjects } from "@/lib/questions/query";

export const runtime = "nodejs";

/**
 * Daftar mata pelajaran untuk dropdown soal. Read-only dan dipakai bersama
 * TEACHER + ADMIN; CRUD subject menyusul di Fase 9.
 */
export async function GET() {
  try {
    await requireRole(["TEACHER", "ADMIN"]);
    const subjects = await listSubjects();

    return NextResponse.json(subjects);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    console.error("[api/subjects]", error);

    return NextResponse.json(
      { message: "Terjadi kesalahan pada server" },
      { status: 500 },
    );
  }
}
