import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    name: string;
    email: string;
    role: string;
    classroom: string | null;
  },
}));

/**
 * Route handler memakai `requireRole` asli supaya kode 401/403 ikut teruji.
 * Yang dimock hanya pembacaan header Next dan lookup sesi better-auth.
 */
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        sessionState.user ? { user: sessionState.user } : null,
    },
  },
}));

import { DELETE as deleteSubject, PATCH as patchSubject } from "@/app/api/subjects/[id]/route";
import { GET as listSubjects, POST as createSubject } from "@/app/api/subjects/route";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

type JsonBody = Record<string, unknown>;

const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const subjectIds: string[] = [];
const questionIds: string[] = [];
const examIds: string[] = [];
const userIds: string[] = [];

let teacher: TestUser;
let admin: TestUser;
let student: TestUser;

function actAs(user: TestUser | null) {
  sessionState.user = user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        classroom: user.classroom,
      }
    : null;
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createAs(user: TestUser, payload: unknown) {
  actAs(user);
  const response = await createSubject(jsonRequest("/api/subjects", "POST", payload));
  const body = (await response.json()) as JsonBody;

  if (response.status === 201 && typeof body.id === "string") {
    subjectIds.push(body.id);
  }

  return { status: response.status, body };
}

async function patchAs(user: TestUser, id: string, payload: unknown) {
  actAs(user);
  const response = await patchSubject(
    jsonRequest(`/api/subjects/${id}`, "PATCH", payload),
    { params: Promise.resolve({ id }) },
  );
  const body = (await response.json()) as JsonBody;

  return { status: response.status, body };
}

async function deleteAs(user: TestUser, id: string) {
  actAs(user);
  const response = await deleteSubject(
    new Request(`http://localhost/api/subjects/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  );
  const body = (await response.json()) as JsonBody;

  return { status: response.status, body };
}

async function getAs(user: TestUser, query = "") {
  actAs(user);
  const response = await listSubjects(
    new Request(`http://localhost/api/subjects${query}`),
  );
  const body = (await response.json()) as JsonBody[];

  return { status: response.status, body };
}

async function createQuestionFor(
  subjectId: string,
  deletedAt: Date | null = null,
) {
  const question = await prisma.question.create({
    data: {
      subjectId,
      type: "ESSAY",
      questionText: `Soal mapel ${randomUUID()}`,
      ownerId: teacher.id,
      deletedAt,
    },
    select: { id: true },
  });

  questionIds.push(question.id);

  return question;
}

async function createExamFor(subjectId: string) {
  const exam = await prisma.exam.create({
    data: {
      title: `Ujian mapel ${randomUUID()}`,
      subjectId,
      ownerId: teacher.id,
      durationMinutes: 60,
    },
    select: { id: true },
  });

  examIds.push(exam.id);

  return exam;
}

beforeAll(async () => {
  teacher = await prisma.user.create({
    data: {
      name: "Guru Subject Vitest",
      email: `vitest-subject-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  admin = await prisma.user.create({
    data: {
      name: "Admin Subject Vitest",
      email: `vitest-subject-admin-${suffix}@example.com`,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  student = await prisma.user.create({
    data: {
      name: "Siswa Subject Vitest",
      email: `vitest-subject-student-${suffix}@example.com`,
      role: "STUDENT",
      classroom: "XII IPA 1",
      emailVerified: true,
    },
  });

  userIds.push(teacher.id, admin.id, student.id);
});

afterAll(async () => {
  await prisma.examQuestion.deleteMany({
    where: { examId: { in: examIds } },
  });
  await prisma.exam.deleteMany({ where: { id: { in: examIds } } });
  await prisma.questionOption.deleteMany({
    where: { questionId: { in: questionIds } },
  });
  await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("POST /api/subjects", () => {
  it("TEACHER membuat mapel valid → 201, code uppercase, ownerId creator", async () => {
    const code = `sbj-${suffix}`;
    const { status, body } = await createAs(teacher, {
      name: "Mapel Uji",
      code,
    });

    expect(status).toBe(201);
    expect(body.code).toBe(`SBJ-${suffix}`);
    expect(body.name).toBe("Mapel Uji");
    expect(Object.keys(body).sort()).toEqual(["code", "id", "name"]);

    const row = await prisma.subject.findUnique({
      where: { id: body.id as string },
      select: { ownerId: true, code: true },
    });

    expect(row?.ownerId).toBe(teacher.id);
    expect(row?.code).toBe(`SBJ-${suffix}`);
  });

  it("kode duplikat exact dan case-insensitive → 409", async () => {
    const base = await createAs(teacher, {
      name: "Mapel Duplikat",
      code: `DUP-${suffix}`,
    });

    expect(base.status).toBe(201);

    const exact = await createAs(teacher, {
      name: "Mapel Duplikat 2",
      code: `DUP-${suffix}`,
    });
    const lower = await createAs(teacher, {
      name: "Mapel Duplikat 3",
      code: `dup-${suffix}`,
    });

    expect(exact.status).toBe(409);
    expect(lower.status).toBe(409);
    expect(lower.body.message).toContain("Kode mapel sudah dipakai");
  });

  it("kode tidak valid dan field asing → 400", async () => {
    const invalid = await createAs(teacher, {
      name: "Mapel Invalid",
      code: "MTK 1",
    });
    const extraField = await createAs(teacher, {
      name: "Mapel Extra",
      code: `EXT-${suffix}`,
      ownerId: teacher.id,
    });

    expect(invalid.status).toBe(400);
    expect(extraField.status).toBe(400);
  });
});

describe("PATCH /api/subjects/[id]", () => {
  it("ubah name saja → 200, code tidak berubah", async () => {
    const created = await createAs(teacher, {
      name: "Nama Lama",
      code: `P4-${suffix}`,
    });
    const id = created.body.id as string;

    const { status, body } = await patchAs(teacher, id, { name: "Nama Baru" });

    expect(status).toBe(200);
    expect(body.name).toBe("Nama Baru");
    expect(body.code).toBe(`P4-${suffix}`);

    const row = await prisma.subject.findUnique({
      where: { id },
      select: { name: true, code: true },
    });

    expect(row).toEqual({ name: "Nama Baru", code: `P4-${suffix}` });
  });

  it("PATCH dengan code yang sama (no-op) → 200, bukan 409", async () => {
    const code = `P5-${suffix}`;
    const created = await createAs(teacher, { name: "No-op Awal", code });
    const id = created.body.id as string;

    const { status, body } = await patchAs(teacher, id, {
      name: "No-op Akhir",
      code,
    });

    expect(status).toBe(200);
    expect(body.name).toBe("No-op Akhir");
    expect(body.code).toBe(code);
  });

  it("code lowercase dinormalisasi → uppercase di response dan DB", async () => {
    const created = await createAs(teacher, {
      name: "Mapel Normalisasi",
      code: `P6-${suffix}`,
    });
    const id = created.body.id as string;

    const { status, body } = await patchAs(teacher, id, {
      name: "Mapel Normalisasi",
      code: `p6new-${suffix}`,
    });

    expect(status).toBe(200);
    expect(body.code).toBe(`P6NEW-${suffix}`);

    const row = await prisma.subject.findUnique({
      where: { id },
      select: { code: true },
    });

    expect(row?.code).toBe(`P6NEW-${suffix}`);
  });

  it("code bentrok mapel lain → 409 dan data lama tidak berubah", async () => {
    const first = await createAs(teacher, {
      name: "Mapel A",
      code: `P7A-${suffix}`,
    });
    const second = await createAs(teacher, {
      name: "Mapel B",
      code: `P7B-${suffix}`,
    });
    const id = first.body.id as string;

    const { status, body } = await patchAs(teacher, id, {
      name: "Mapel A",
      code: second.body.code as string,
    });

    expect(status).toBe(409);
    expect(body.message).toContain("Kode mapel sudah dipakai");

    const row = await prisma.subject.findUnique({
      where: { id },
      select: { code: true },
    });

    expect(row?.code).toBe(`P7A-${suffix}`);
  });
});

describe("DELETE /api/subjects/[id]", () => {
  it("tanpa referensi → 200 { deleted, id } dan row hilang", async () => {
    const created = await createAs(teacher, {
      name: "Mapel Tanpa Relasi",
      code: `DEL-${suffix}`,
    });
    const id = created.body.id as string;

    const { status, body } = await deleteAs(teacher, id);

    expect(status).toBe(200);
    expect(body).toEqual({ deleted: true, id });

    const row = await prisma.subject.findUnique({ where: { id } });
    expect(row).toBeNull();
  });

  it("dengan questions → 409 + details.questionCount, subject tetap ada", async () => {
    const created = await createAs(teacher, {
      name: "Mapel Dengan Soal",
      code: `DQ-${suffix}`,
    });
    const id = created.body.id as string;

    await createQuestionFor(id);

    const { status, body } = await deleteAs(teacher, id);

    expect(status).toBe(409);
    expect(body.details).toEqual({ questionCount: 1, examCount: 0 });

    const row = await prisma.subject.findUnique({ where: { id } });
    expect(row).not.toBeNull();
  });

  it("dengan exams → 409 + details.examCount, subject tetap ada", async () => {
    const created = await createAs(teacher, {
      name: "Mapel Dengan Ujian",
      code: `DE-${suffix}`,
    });
    const id = created.body.id as string;

    await createExamFor(id);

    const { status, body } = await deleteAs(teacher, id);

    expect(status).toBe(409);
    expect(body.details).toEqual({ questionCount: 0, examCount: 1 });

    const row = await prisma.subject.findUnique({ where: { id } });
    expect(row).not.toBeNull();
  });

  it("soal soft-deleted tetap dihitung → 409 (FK Restrict)", async () => {
    const created = await createAs(teacher, {
      name: "Mapel Dengan Arsip",
      code: `DS-${suffix}`,
    });
    const id = created.body.id as string;

    await createQuestionFor(id, new Date());

    const { status, body } = await deleteAs(teacher, id);

    expect(status).toBe(409);
    expect(body.details).toEqual({ questionCount: 1, examCount: 0 });

    const row = await prisma.subject.findUnique({ where: { id } });
    expect(row).not.toBeNull();
  });
});

describe("GET /api/subjects", () => {
  it("tanpa withStats tetap shape lama { id, name, code } dan search case-insensitive", async () => {
    const created = await createAs(teacher, {
      name: `Mapel Cari ${suffix}`,
      code: `CR-${suffix}`,
    });

    const { status, body } = await getAs(
      teacher,
      `?search=${encodeURIComponent(`cr-${suffix}`)}`,
    );

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(created.body.id);
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(["code", "id", "name"]);
    expect(body[0]).not.toHaveProperty("_count");
    expect(body[0]).not.toHaveProperty("ownerId");
  });

  it("?withStats=1 mengembalikan _count benar (termasuk arsip)", async () => {
    const created = await createAs(teacher, {
      name: `Mapel Stats ${suffix}`,
      code: `ST-${suffix}`,
    });
    const id = created.body.id as string;

    await createQuestionFor(id);
    await createExamFor(id);

    const { status, body } = await getAs(
      teacher,
      `?withStats=1&search=${encodeURIComponent(`st-${suffix}`)}`,
    );

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(id);
    expect(Object.keys(body[0] ?? {}).sort()).toEqual([
      "_count",
      "code",
      "id",
      "name",
    ]);
    expect(body[0]?._count).toEqual({ questions: 1, exams: 1 });
  });
});

describe("RBAC /api/subjects", () => {
  it("STUDENT 403 di semua method, tanpa sesi 401, ADMIN full access", async () => {
    const created = await createAs(teacher, {
      name: "Mapel RBAC",
      code: `RB-${suffix}`,
    });
    const id = created.body.id as string;

    const studentGet = await getAs(student);
    const studentPost = await createAs(student, {
      name: "Mapel Siswa",
      code: `RB2-${suffix}`,
    });
    const studentPatch = await patchAs(student, id, { name: "Dibajak" });
    const studentDelete = await deleteAs(student, id);

    expect(studentGet.status).toBe(403);
    expect(studentPost.status).toBe(403);
    expect(studentPatch.status).toBe(403);
    expect(studentDelete.status).toBe(403);

    actAs(null);
    const anonymous = await listSubjects(
      new Request("http://localhost/api/subjects"),
    );
    expect(anonymous.status).toBe(401);

    const adminCreate = await createAs(admin, {
      name: "Mapel Admin",
      code: `RB3-${suffix}`,
    });
    expect(adminCreate.status).toBe(201);

    const adminPatch = await patchAs(admin, id, { name: "Diubah Admin" });
    expect(adminPatch.status).toBe(200);
    expect(adminPatch.body.name).toBe("Diubah Admin");

    const adminDelete = await deleteAs(admin, id);
    expect(adminDelete.status).toBe(200);
    expect(adminDelete.body).toEqual({ deleted: true, id });
  });
});
