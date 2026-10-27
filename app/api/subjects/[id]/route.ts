import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { HttpError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  findSubjectByCode,
  findSubjectById,
  getSubjectUsage,
  subjectSelect,
  toSubjectUpdateData,
} from "@/lib/subjects/query";
import { subjectUpdateSchema } from "@/lib/zod-schemas/subject";

import {
  readJsonBody,
  requireSubjectManager,
  subjectApiError,
  subjectConflict,
  validationError,
} from "../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const DELETE_CONFLICT_MESSAGE =
  "Tidak bisa hapus mapel: masih ada soal atau ujian terkait";

function deleteConflict(usage: {
  questionCount: number;
  examCount: number;
}): NextResponse {
  return subjectConflict(DELETE_CONFLICT_MESSAGE, usage);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireSubjectManager();
    const { id } = await params;

    const existing = await findSubjectById(id);

    if (!existing) {
      throw new HttpError(404, "Mapel tidak ditemukan");
    }

    const payload = await readJsonBody(request);

    if (!payload.ok) {
      return NextResponse.json(
        { message: "Body request harus berupa JSON" },
        { status: 400 },
      );
    }

    const parsed = subjectUpdateSchema.safeParse(payload.body);

    if (!parsed.success) {
      return validationError("Data mapel tidak valid", parsed.error);
    }

    const data = toSubjectUpdateData(parsed.data);

    if (data.code !== undefined) {
      // `excludeId` wajib: PATCH { name, code } dengan code yang sama harus
      // lolos (no-op), bukan dianggap duplikat.
      const duplicate = await findSubjectByCode(data.code, id);

      if (duplicate) {
        return subjectConflict("Kode mapel sudah dipakai", {
          code: data.code,
        });
      }
    }

    const subject = await prisma.subject.update({
      where: { id },
      data,
      select: subjectSelect,
    });

    return NextResponse.json(subject);
  } catch (error) {
    return subjectApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    await requireSubjectManager();
    const { id } = await params;

    const existing = await findSubjectById(id);

    if (!existing) {
      throw new HttpError(404, "Mapel tidak ditemukan");
    }

    const usage = await getSubjectUsage(id);

    if (usage.questionCount > 0 || usage.examCount > 0) {
      return deleteConflict(usage);
    }

    try {
      await prisma.subject.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      // Defense in depth: soal/ujian bisa dibuat setelah count di atas.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return deleteConflict(await getSubjectUsage(id));
      }

      throw error;
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return subjectApiError(error);
  }
}
