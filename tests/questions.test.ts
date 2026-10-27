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
 * Route handler memakai `requireRole` asli (bukan di-stub) supaya kode 401/403
 * ikut teruji. Yang dimock hanya dua batas sistem: pembacaan header Next dan
 * lookup sesi better-auth.
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

import { DELETE, GET as getQuestion } from "@/app/api/questions/[id]/route";
import { GET as listQuestions, POST as createQuestion } from "@/app/api/questions/route";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

let teacher: TestUser;
let admin: TestUser;
let student: TestUser;
let subjectId: string;

function actAs(user: TestUser) {
  sessionState.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    classroom: user.classroom,
  };
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function basePayload(questionText: string) {
  return {
    subjectId,
    questionText,
    explanation: "Pembahasan uji.",
    difficulty: "EASY",
    points: 1,
  };
}

function choicePayload(
  questionText: string,
  correctIndexes: number[],
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" = "SINGLE_CHOICE",
) {
  return {
    ...basePayload(questionText),
    type,
    options: ["A", "B", "C"].map((label, index) => ({
      label,
      text: `Opsi ${label}`,
      isCorrect: correctIndexes.includes(index),
    })),
  };
}

async function createAs(
  user: TestUser,
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  actAs(user);
  const response = await createQuestion(
    jsonRequest("/api/questions", "POST", payload),
  );
  const body = (await response.json()) as Record<string, unknown>;

  return { status: response.status, body };
}

beforeAll(async () => {
  const suffix = randomUUID();

  teacher = await prisma.user.create({
    data: {
      name: "Guru Vitest",
      email: `vitest-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  admin = await prisma.user.create({
    data: {
      name: "Admin Vitest",
      email: `vitest-admin-${suffix}@example.com`,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  student = await prisma.user.create({
    data: {
      name: "Siswa Vitest",
      email: `vitest-student-${suffix}@example.com`,
      role: "STUDENT",
      classroom: "XII IPA 1",
      emailVerified: true,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      name: `Mapel Vitest ${suffix.slice(0, 8)}`,
      code: `VT-${suffix.slice(0, 8)}`,
      ownerId: teacher.id,
    },
  });

  subjectId = subject.id;
});

afterAll(async () => {
  const ownerIds = [teacher.id, admin.id, student.id];

  await prisma.question.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.subject.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
  await prisma.$disconnect();
});

describe("POST /api/questions", () => {
  it("TEACHER membuat SINGLE_CHOICE valid → 201", async () => {
    const { status, body } = await createAs(
      teacher,
      choicePayload("Ibu kota Indonesia adalah ...", [1]),
    );

    expect(status).toBe(201);
    expect(body.type).toBe("SINGLE_CHOICE");
    expect(body.ownerId).toBe(teacher.id);
    expect(body.options).toHaveLength(3);
  });

  it("SINGLE_CHOICE tanpa kunci → 400", async () => {
    const { status } = await createAs(
      teacher,
      choicePayload("Soal tanpa kunci", []),
    );

    expect(status).toBe(400);
  });

  it("SINGLE_CHOICE dengan 2 kunci → 400", async () => {
    const { status } = await createAs(
      teacher,
      choicePayload("Soal dua kunci", [0, 2]),
    );

    expect(status).toBe(400);
  });

  it("MULTIPLE_CHOICE dengan 2 kunci → 201", async () => {
    const { status, body } = await createAs(
      teacher,
      choicePayload("Pilih bilangan genap", [0, 2], "MULTIPLE_CHOICE"),
    );

    expect(status).toBe(201);
    expect(body.type).toBe("MULTIPLE_CHOICE");
  });

  it("TRUE_FALSE tanpa correctAnswer → 400", async () => {
    const { status } = await createAs(teacher, {
      ...basePayload("7 adalah bilangan prima."),
      type: "TRUE_FALSE",
    });

    expect(status).toBe(400);
  });
});

describe("GET /api/questions", () => {
  it("STUDENT ditolak → 403", async () => {
    actAs(student);
    const response = await listQuestions(
      new Request("http://localhost/api/questions"),
    );

    expect(response.status).toBe(403);
  });

  it("ADMIN melihat soal buatan TEACHER (scope filter)", async () => {
    const text = `Soal scope admin ${randomUUID()}`;
    const created = await createAs(teacher, choicePayload(text, [0]));

    expect(created.status).toBe(201);

    actAs(admin);
    const response = await listQuestions(
      new Request(
        `http://localhost/api/questions?search=${encodeURIComponent(text)}`,
      ),
    );
    const body = (await response.json()) as {
      items: { id: string; ownerId: string }[];
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items[0]?.id).toBe(created.body.id);
    expect(body.items[0]?.ownerId).toBe(teacher.id);
  });

  it("TEACHER tidak bisa GET soal milik ADMIN → 404 (bukan 403)", async () => {
    const text = `Soal milik admin ${randomUUID()}`;
    const created = await createAs(admin, choicePayload(text, [0]));

    expect(created.status).toBe(201);

    const id = created.body.id as string;

    actAs(teacher);
    const asTeacher = await getQuestion(
      new Request(`http://localhost/api/questions/${id}`),
      { params: Promise.resolve({ id }) },
    );

    // 404, bukan 403: jangan bocorkan keberadaan resource milik user lain.
    expect(asTeacher.status).toBe(404);

    actAs(admin);
    const asAdmin = await getQuestion(
      new Request(`http://localhost/api/questions/${id}`),
      { params: Promise.resolve({ id }) },
    );

    expect(asAdmin.status).toBe(200);
  });
});

describe("DELETE /api/questions/[id]", () => {
  it("TEACHER soft-delete → hilang dari list, deletedAt terisi di database", async () => {
    const text = `Soal untuk dihapus ${randomUUID()}`;
    const created = await createAs(teacher, choicePayload(text, [2]));
    const id = created.body.id as string;

    expect(created.status).toBe(201);

    actAs(teacher);
    const deleted = await DELETE(
      new Request(`http://localhost/api/questions/${id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id }) },
    );

    expect(deleted.status).toBe(200);

    const stored = await prisma.question.findUniqueOrThrow({
      where: { id },
      select: { deletedAt: true },
    });

    expect(stored.deletedAt).not.toBeNull();

    actAs(teacher);
    const list = await listQuestions(
      new Request(
        `http://localhost/api/questions?search=${encodeURIComponent(text)}`,
      ),
    );
    const body = (await list.json()) as { total: number };

    expect(body.total).toBe(0);

    const detail = await getQuestion(
      new Request(`http://localhost/api/questions/${id}`),
      { params: Promise.resolve({ id }) },
    );

    expect(detail.status).toBe(404);
  });
});
