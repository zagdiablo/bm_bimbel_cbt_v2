import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Error yang aman dikirim ke client. Status dipakai apa adanya oleh `apiError`.
 * Helper ini sengaja tidak bergantung pada modul auth/Prisma supaya bisa dipakai
 * oleh semua route API (Bank Soal, import, exam) tanpa import melingkar.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * `context` hanya memengaruhi prefix log server. Respons 500 tidak pernah
 * membocorkan detail internal.
 */
export function apiError(error: unknown, context = "api"): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status },
    );
  }

  console.error(`[${context}]`, error);

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
