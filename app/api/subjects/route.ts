import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  findSubjectByCode,
  listSubjectOptions,
  listSubjectsWithStats,
  subjectSelect,
  toSubjectData,
} from "@/lib/subjects/query";
import {
  subjectInputSchema,
  subjectListQuerySchema,
} from "@/lib/zod-schemas/subject";

import {
  readJsonBody,
  requireSubjectManager,
  subjectApiError,
  subjectConflict,
  validationError,
} from "./_shared";

export const runtime = "nodejs";

/**
 * GET tetap backward-compatible untuk dropdown Fase 2/3:
 * tanpa `?withStats=1` → `[{ id, name, code }]`.
 * `?search=` memfilter nama/kode (case-insensitive) di kedua mode.
 */
export async function GET(request: Request) {
  try {
    await requireSubjectManager();

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = subjectListQuerySchema.safeParse(params);

    if (!parsed.success) {
      return validationError("Parameter filter tidak valid", parsed.error);
    }

    const subjects =
      parsed.data.withStats === "1"
        ? await listSubjectsWithStats(parsed.data)
        : await listSubjectOptions(parsed.data.search);

    return NextResponse.json(subjects);
  } catch (error) {
    return subjectApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSubjectManager();
    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = subjectInputSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Data mapel tidak valid", parsed.error);
    }

    const data = toSubjectData(parsed.data);

    if (await findSubjectByCode(data.code)) {
      return subjectConflict("Kode mapel sudah dipakai", { code: data.code });
    }

    const subject = await prisma.subject.create({
      data: {
        ...data,
        // Audit trail only; bukan scope kepemilikan.
        ownerId: user.id,
      },
      select: subjectSelect,
    });

    return NextResponse.json(subject, { status: 201 });
  } catch (error) {
    return subjectApiError(error);
  }
}
