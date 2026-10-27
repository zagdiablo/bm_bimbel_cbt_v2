import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const sessionState = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    name: string;
    email: string;
    role: string;
    classroom: string | null;
  },
}));

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

import { POST as commitImport } from "@/app/api/questions/import/commit/route";
import { POST as previewImport } from "@/app/api/questions/import/preview/route";
import { prisma } from "@/lib/prisma";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "import");
const HEADER = [
  "subject_code",
  "type",
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct_answers",
  "points",
  "difficulty",
  "explanation",
] as const;

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

type RowInput = {
  subjectCode: string;
  type: string;
  question: string;
  options?: string[];
  correctAnswers?: string;
  points?: string | number;
  difficulty?: string;
  explanation?: string;
};

let teacher: TestUser;
let otherTeacher: TestUser;
let subjectId: string;
let subjectCode: string;
let uploadDir: string;

function actAs(user: TestUser) {
  sessionState.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    classroom: user.classroom,
  };
}

function xlsxRow(input: RowInput): unknown[] {
  const options = input.options ?? [];

  return [
    input.subjectCode,
    input.type,
    input.question,
    options[0] ?? "",
    options[1] ?? "",
    options[2] ?? "",
    options[3] ?? "",
    options[4] ?? "",
    input.correctAnswers ?? "",
    input.points ?? "",
    input.difficulty ?? "",
    input.explanation ?? "",
  ];
}

function makeXlsx(rows: RowInput[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [...HEADER],
    ...rows.map((row) => xlsxRow(row)),
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "questions");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}

async function fixture(name: string): Promise<Buffer> {
  return readFile(path.join(FIXTURE_DIR, name));
}

function multipartRequest(
  buffer: Buffer,
  filename: string,
  mime: string,
  subject?: string,
): Request {
  const formData = new FormData();
  formData.set(
    "file",
    new File([new Uint8Array(buffer)], filename, { type: mime }),
  );

  if (subject) {
    formData.set("subjectId", subject);
  }

  return new Request("http://localhost/api/questions/import/preview", {
    method: "POST",
    body: formData,
  });
}

async function previewAs(
  user: TestUser,
  buffer: Buffer,
  filename: string,
  mime: string,
  subject?: string,
) {
  actAs(user);

  const response = await previewImport(
    multipartRequest(buffer, filename, mime, subject),
  );
  const body = (await response.json()) as {
    importJobId?: string;
    status?: string;
    summary?: { total: number; valid: number; invalid: number };
    questions?: {
      rowNumber: number;
      data: unknown;
      errors: string[];
    }[];
    globalErrors?: string[];
    message?: string;
  };

  return { response, body };
}

async function commitAs(user: TestUser, importJobId: string) {
  actAs(user);

  const response = await commitImport(
    new Request("http://localhost/api/questions/import/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ importJobId }),
    }),
  );
  const body = (await response.json()) as {
    status?: string;
    createdCount?: number;
    message?: string;
  };

  return { response, body };
}

beforeAll(async () => {
  const suffix = randomUUID();
  uploadDir = await mkdtemp(path.join(tmpdir(), "cbt-import-test-"));
  process.env.IMPORT_UPLOAD_DIR = uploadDir;

  teacher = await prisma.user.create({
    data: {
      name: "Guru Import Vitest",
      email: `vitest-import-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  otherTeacher = await prisma.user.create({
    data: {
      name: "Guru Import Lain",
      email: `vitest-import-other-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  subjectCode = `VT-${suffix.slice(0, 8).toUpperCase()}`;
  const subject = await prisma.subject.create({
    data: {
      name: `Mapel Import Vitest ${suffix.slice(0, 8)}`,
      code: subjectCode,
      ownerId: teacher.id,
    },
  });

  subjectId = subject.id;
});

afterAll(async () => {
  const ownerIds = [teacher.id, otherTeacher.id];

  await prisma.question.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.importJob.deleteMany({
    where: { userId: { in: ownerIds } },
  });
  await prisma.subject.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
  await prisma.$disconnect();

  delete process.env.IMPORT_UPLOAD_DIR;
  await rm(uploadDir, { recursive: true, force: true });
});

describe("POST /api/questions/import/preview", () => {
  it("XLSX valid 3 baris → 3 valid", async () => {
    const buffer = makeXlsx([
      {
        subjectCode,
        type: "SINGLE_CHOICE",
        question: "Soal single import",
        options: ["Satu", "Dua", "Tiga"],
        correctAnswers: "B",
        points: 1,
        difficulty: "EASY",
      },
      {
        subjectCode,
        type: "MULTIPLE_CHOICE",
        question: "Soal multiple import",
        options: ["Satu", "Dua", "Tiga"],
        correctAnswers: "A,C",
        points: 2,
        difficulty: "MEDIUM",
      },
      {
        subjectCode,
        type: "TRUE_FALSE",
        question: "Soal true false import",
        correctAnswers: "true",
        points: 1,
        difficulty: "EASY",
      },
    ]);

    const { response, body } = await previewAs(
      teacher,
      buffer,
      "valid.xlsx",
      XLSX_MIME,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 3, valid: 3, invalid: 0 });
    expect(body.questions).toHaveLength(3);
  });

  it("XLSX dengan 1 type invalid → 2 valid, 1 invalid", async () => {
    const buffer = makeXlsx([
      {
        subjectCode,
        type: "SINGLE_CHOICE",
        question: "Baris valid satu",
        options: ["A", "B"],
        correctAnswers: "A",
      },
      {
        subjectCode,
        type: "SINGLE_CHOISE",
        question: "Baris type salah",
        options: ["A", "B"],
        correctAnswers: "A",
      },
      {
        subjectCode,
        type: "TRUE_FALSE",
        question: "Baris valid dua",
        correctAnswers: "false",
      },
    ]);

    const { response, body } = await previewAs(
      teacher,
      buffer,
      "invalid-type.xlsx",
      XLSX_MIME,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 3, valid: 2, invalid: 1 });
    expect(body.questions?.[1]?.errors.join(" ")).toContain("tidak dikenal");
  });

  it("XLSX correct_answers duplikat label → baris invalid", async () => {
    const buffer = makeXlsx([
      {
        subjectCode,
        type: "SINGLE_CHOICE",
        question: "Soal duplikat label",
        options: ["A", "B"],
        correctAnswers: "A,A",
      },
    ]);

    const { response, body } = await previewAs(
      teacher,
      buffer,
      "duplicate-label.xlsx",
      XLSX_MIME,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(body.questions?.[0]?.errors.join(" ")).toContain("duplikat");
  });

  it("DOCX valid 2 soal → 2 valid", async () => {
    const { response, body } = await previewAs(
      teacher,
      await fixture("valid.docx"),
      "valid.docx",
      DOCX_MIME,
      subjectId,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 2, valid: 2, invalid: 0 });
    expect(body.questions?.map((question) => question.data)).toHaveLength(2);
  });

  it("DOCX tanpa Jawaban → error per soal", async () => {
    const { response, body } = await previewAs(
      teacher,
      await fixture("invalid-no-answer.docx"),
      "invalid-no-answer.docx",
      DOCX_MIME,
      subjectId,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(body.questions?.[0]?.errors.join(" ")).toContain(
      "Jawaban wajib diisi",
    );
  });

  it("PDF valid 1 soal → 1 valid", async () => {
    const { response, body } = await previewAs(
      teacher,
      await fixture("valid.pdf"),
      "valid.pdf",
      PDF_MIME,
      subjectId,
    );

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
  });

  it("PDF corrupt → global error", async () => {
    const { response, body } = await previewAs(
      teacher,
      await fixture("corrupt.pdf"),
      "corrupt.pdf",
      PDF_MIME,
      subjectId,
    );

    expect(response.status).toBe(200);
    expect(body.status).toBe("FAILED");
    expect(body.questions).toEqual([]);
    expect(body.globalErrors?.join(" ")).toContain("tidak valid");
  });
});

describe("POST /api/questions/import/commit", () => {
  it("commit 50 soal valid → 50 soal dibuat, job COMMITTED, di bawah 30 detik", async () => {
    const prefix = `Import 50 soal ${randomUUID()}`;
    const buffer = makeXlsx(
      Array.from({ length: 50 }, (_, index) => ({
        subjectCode,
        type: "SINGLE_CHOICE",
        question: `${prefix} nomor ${index + 1}`,
        options: ["Satu", "Dua", "Tiga", "Empat"],
        correctAnswers: "A",
        points: 1,
        difficulty: "MEDIUM",
      })),
    );

    const preview = await previewAs(
      teacher,
      buffer,
      "fifty.xlsx",
      XLSX_MIME,
    );

    expect(preview.response.status).toBe(200);
    expect(preview.body.summary).toEqual({
      total: 50,
      valid: 50,
      invalid: 0,
    });

    const importJobId = preview.body.importJobId as string;
    const started = performance.now();
    const { response, body } = await commitAs(teacher, importJobId);
    const durationMs = performance.now() - started;

    expect(response.status).toBe(200);
    expect(body.status).toBe("COMMITTED");
    expect(body.createdCount).toBe(50);
    expect(durationMs).toBeLessThan(30_000);

    const [count, job] = await Promise.all([
      prisma.question.count({
        where: {
          ownerId: teacher.id,
          questionText: { startsWith: prefix },
        },
      }),
      prisma.importJob.findUniqueOrThrow({
        where: { id: importJobId },
        select: { status: true, createdCount: true },
      }),
    ]);

    expect(count).toBe(50);
    expect(job.status).toBe("COMMITTED");
    expect(job.createdCount).toBe(50);

    console.info(
      `[import] commit 50 soal selesai dalam ${Math.round(durationMs)}ms`,
    );
  });

  it("commit job bukan milik user → 404", async () => {
    const preview = await previewAs(
      teacher,
      makeXlsx([
        {
          subjectCode,
          type: "TRUE_FALSE",
          question: "Soal milik guru lain",
          correctAnswers: "true",
        },
      ]),
      "owner.xlsx",
      XLSX_MIME,
    );

    const importJobId = preview.body.importJobId as string;
    const { response } = await commitAs(otherTeacher, importJobId);

    expect(response.status).toBe(404);
  });

  it("commit job yang sudah COMMITTED (double) → 400", async () => {
    const preview = await previewAs(
      teacher,
      makeXlsx([
        {
          subjectCode,
          type: "TRUE_FALSE",
          question: "Soal double commit",
          correctAnswers: "false",
        },
      ]),
      "double.xlsx",
      XLSX_MIME,
    );

    const importJobId = preview.body.importJobId as string;

    const first = await commitAs(teacher, importJobId);
    const second = await commitAs(teacher, importJobId);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(400);
  });
});
