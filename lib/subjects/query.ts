import { cache } from "react";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  SubjectInput,
  SubjectListQuery,
  SubjectUpdate,
} from "@/lib/zod-schemas/subject";

export const subjectSelect = {
  id: true,
  name: true,
  code: true,
} satisfies Prisma.SubjectSelect;

export type SubjectOption = Prisma.SubjectGetPayload<{
  select: typeof subjectSelect;
}>;

export type SubjectWithStats = SubjectOption & {
  _count: { questions: number; exams: number };
};

export function normalizeSubjectCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * `code` disimpan uppercase agar `@unique` di Postgres konsisten. Normalisasi
 * dilakukan di server (bukan di Zod transform) supaya form RHF tetap sederhana
 * dan aturan ini mudah diuji.
 */
export function toSubjectData(input: SubjectInput): {
  name: string;
  code: string;
} {
  return {
    name: input.name,
    code: normalizeSubjectCode(input.code),
  };
}

export function toSubjectUpdateData(input: SubjectUpdate): {
  name?: string;
  code?: string;
} {
  const data: { name?: string; code?: string } = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.code !== undefined) {
    data.code = normalizeSubjectCode(input.code);
  }

  return data;
}

function buildSubjectWhere(search?: string): Prisma.SubjectWhereInput {
  const term = search?.trim();

  if (!term) {
    return {};
  }

  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { code: { contains: term, mode: "insensitive" } },
    ],
  };
}

/**
 * Bentuk lama untuk dropdown (`{ id, name, code }[]`). `search` opsional agar
 * endpoint GET tetap backward-compatible dan bisa dipakai halaman mapel.
 */
export const listSubjectOptions = cache(
  async (search?: string): Promise<SubjectOption[]> => {
    return prisma.subject.findMany({
      where: buildSubjectWhere(search),
      orderBy: { name: "asc" },
      select: subjectSelect,
    });
  },
);

export async function listSubjects(): Promise<SubjectOption[]> {
  return listSubjectOptions();
}

/**
 * `_count` menghitung SEMUA soal (termasuk soft-deleted) dan ujian. Ini
 * disengaja: baris soft-delete masih ada di database dan tetap memblokir
 * hard-delete mapel karena FK `onDelete: Restrict`.
 */
export async function listSubjectsWithStats(
  query: SubjectListQuery,
): Promise<SubjectWithStats[]> {
  return prisma.subject.findMany({
    where: buildSubjectWhere(query.search),
    orderBy: { name: "asc" },
    select: {
      ...subjectSelect,
      _count: { select: { questions: true, exams: true } },
    },
  });
}

export async function findSubjectById(
  id: string,
): Promise<SubjectOption | null> {
  return prisma.subject.findUnique({
    where: { id },
    select: subjectSelect,
  });
}

/**
 * Pencarian duplikat case-insensitive karena data lama bisa tersimpan lowercase
 * (mis. dibuat lewat Prisma Studio/SQL sebelum fase ini).
 */
export async function findSubjectByCode(
  code: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.subject.findFirst({
    where: {
      code: { equals: normalizeSubjectCode(code), mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

/**
 * Hitungan untuk delete guard. TIDAK memakai filter `deletedAt: null`:
 * soal soft-delete tetap punya baris dan tetap direferensikan FK.
 */
export async function getSubjectUsage(
  id: string,
): Promise<{ questionCount: number; examCount: number }> {
  const [questionCount, examCount] = await prisma.$transaction([
    prisma.question.count({ where: { subjectId: id } }),
    prisma.exam.count({ where: { subjectId: id } }),
  ]);

  return { questionCount, examCount };
}

export async function subjectExists(subjectId: string): Promise<boolean> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });

  return subject !== null;
}
