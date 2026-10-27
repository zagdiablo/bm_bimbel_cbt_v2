import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

import { GET as exportQuestions } from "@/app/api/questions/export/route";
import { parseXlsx } from "@/lib/importers/xlsx";
import { prisma } from "@/lib/prisma";
import { toStoredOptions } from "@/lib/questions/answers";
import type { QuestionInput } from "@/lib/zod-schemas/question";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

let teacher: TestUser;
let otherTeacher: TestUser;
let admin: TestUser;
let subject: { id: string; code: string };
let secondSubject: { id: string; code: string };

function actAs(user: TestUser) {
  sessionState.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    classroom: user.classroom,
  };
}

async function createQuestions(
  ownerId: string,
  inputs: readonly QuestionInput[],
) {
  const created = [];

  for (const input of inputs) {
    created.push(
      await prisma.question.create({
        data: {
          subjectId: input.subjectId,
          type: input.type,
          questionText: input.questionText,
          explanation: input.explanation?.trim() || null,
          difficulty: input.difficulty,
          points: input.points,
          ownerId,
          options: { create: toStoredOptions(input) },
        },
      }),
    );
  }

  return created;
}

function fiveQuestions(
  subjectId: string,
  prefix: string,
): QuestionInput[] {
  return [
    {
      subjectId,
      type: "SINGLE_CHOICE",
      questionText: `${prefix} single`,
      explanation: "Pembahasan single.",
      difficulty: "EASY",
      points: 1,
      options: [
        { label: "A", text: "Satu", isCorrect: false },
        { label: "B", text: "Dua", isCorrect: true },
        { label: "C", text: "Tiga", isCorrect: false },
      ],
    },
    {
      subjectId,
      type: "MULTIPLE_CHOICE",
      questionText: `${prefix} multiple`,
      explanation: "Pembahasan multiple.",
      difficulty: "MEDIUM",
      points: 2,
      options: [
        { label: "A", text: "Merah", isCorrect: true },
        { label: "B", text: "Biru", isCorrect: false },
        { label: "C", text: "Hijau", isCorrect: true },
        { label: "D", text: "Kuning", isCorrect: false },
      ],
    },
    {
      subjectId,
      type: "TRUE_FALSE",
      questionText: `${prefix} true false`,
      explanation: "Pembahasan benar salah.",
      difficulty: "EASY",
      points: 1,
      correctAnswer: true,
    },
    {
      subjectId,
      type: "SHORT_ANSWER",
      questionText: `${prefix} short answer`,
      explanation: "Pembahasan jawaban singkat.",
      difficulty: "HARD",
      points: 2,
      correctAnswers: ["72", "tujuh puluh dua"],
    },
    {
      subjectId,
      type: "ESSAY",
      questionText: `${prefix} essay`,
      explanation: "Pembahasan esai.",
      difficulty: "MEDIUM",
      points: 5,
    },
  ];
}

async function fetchExport(
  user: TestUser,
  params: Record<string, string>,
) {
  actAs(user);

  const response = await exportQuestions(
    new Request(
      `http://localhost/api/questions/export?${new URLSearchParams(params)}`,
    ),
  );

  return {
    response,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

function readRows(buffer: Buffer): Record<string, string | number>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["questions"];

  expect(sheet).toBeDefined();

  return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, {
    defval: "",
  });
}

let xlsxPrefix: string;
let xlsxInputs: QuestionInput[];

beforeAll(async () => {
  const suffix = randomUUID();

  teacher = await prisma.user.create({
    data: {
      name: "Guru Export Vitest",
      email: `vitest-export-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  otherTeacher = await prisma.user.create({
    data: {
      name: "Guru Export Lain",
      email: `vitest-export-other-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  admin = await prisma.user.create({
    data: {
      name: "Admin Export Vitest",
      email: `vitest-export-admin-${suffix}@example.com`,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  const main = await prisma.subject.create({
    data: {
      name: `Mapel Export Vitest ${suffix.slice(0, 8)}`,
      code: `VE-${suffix.slice(0, 8).toUpperCase()}`,
      ownerId: teacher.id,
    },
  });

  const second = await prisma.subject.create({
    data: {
      name: `Mapel Export Kedua ${suffix.slice(0, 8)}`,
      code: `VF-${suffix.slice(0, 8).toUpperCase()}`,
      ownerId: teacher.id,
    },
  });

  subject = { id: main.id, code: main.code };
  secondSubject = { id: second.id, code: second.code };

  xlsxPrefix = `Export XLSX ${suffix}`;
  xlsxInputs = fiveQuestions(subject.id, xlsxPrefix);
  await createQuestions(teacher.id, xlsxInputs);
});

afterEach(() => {
  delete process.env.EXPORT_MAX_QUESTIONS;
});

afterAll(async () => {
  const ownerIds = [teacher.id, otherTeacher.id, admin.id];

  await prisma.question.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.importJob.deleteMany({
    where: { userId: { in: ownerIds } },
  });
  await prisma.subject.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
  await prisma.$disconnect();
});

describe("GET /api/questions/export", () => {
  it("XLSX 5 soal → 200, header benar, 5 baris data", async () => {
    const { response, buffer } = await fetchExport(teacher, {
      format: "xlsx",
      search: xlsxPrefix,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_MIME);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="soal-semua-\d{8}-\d{6}\.xlsx"$/,
    );

    const rows = readRows(buffer);

    expect(rows).toHaveLength(5);
    expect(Object.keys(rows[0] ?? {})).toEqual([
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
    ]);
    expect(rows.map((row) => row.subject_code)).toEqual(
      Array.from({ length: 5 }, () => subject.code),
    );
  });

  it("XLSX round-trip: hasil export bisa di-parse ulang parser import", async () => {
    const { buffer } = await fetchExport(teacher, {
      format: "xlsx",
      search: xlsxPrefix,
    });

    const parsed = parseXlsx(buffer, {
      byCode: new Map([
        [subject.code.toLowerCase(), subject.id],
        [secondSubject.code.toLowerCase(), secondSubject.id],
      ]),
    });

    expect(parsed.globalErrors).toEqual([]);
    expect(parsed.questions).toHaveLength(5);

    const originalByText = new Map(
      xlsxInputs.map((input) => [input.questionText, input]),
    );
    const data = parsed.questions.map((question) => {
      expect(question.errors).toEqual([]);
      expect(question.data).not.toBeNull();

      return question.data as QuestionInput;
    });

    for (const item of data) {
      const original = originalByText.get(item.questionText);

      expect(original).toBeDefined();

      if (!original) {
        continue;
      }

      expect(item.type).toBe(original.type);
      expect(item.subjectId).toBe(original.subjectId);
      expect(item.difficulty).toBe(original.difficulty);
      expect(item.points).toBe(original.points);
      expect(item.explanation).toBe(original.explanation);

      if (
        original.type === "SINGLE_CHOICE" ||
        original.type === "MULTIPLE_CHOICE"
      ) {
        expect(item).toMatchObject({ options: original.options });
      } else if (original.type === "TRUE_FALSE") {
        expect(item).toMatchObject({
          correctAnswer: original.correctAnswer,
        });
      } else if (original.type === "SHORT_ANSWER") {
        expect(item).toMatchObject({
          correctAnswers: original.correctAnswers,
        });
      }
    }
  });

  it("PDF 5 soal → 200, application/pdf, magic bytes %PDF-", async () => {
    const { response, buffer } = await fetchExport(teacher, {
      format: "pdf",
      search: xlsxPrefix,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(PDF_MIME);
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="soal-semua-\d{8}-\d{6}\.pdf"$/,
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(1_000);
  });

  it("filter subjectId → XLSX hanya berisi soal mapel tersebut", async () => {
    const prefix = `Export Filter ${randomUUID()}`;

    await createQuestions(teacher.id, [
      {
        subjectId: secondSubject.id,
        type: "TRUE_FALSE",
        questionText: `${prefix} satu`,
        difficulty: "EASY",
        points: 1,
        correctAnswer: true,
      },
      {
        subjectId: secondSubject.id,
        type: "ESSAY",
        questionText: `${prefix} dua`,
        difficulty: "MEDIUM",
        points: 3,
      },
    ]);

    const { response, buffer } = await fetchExport(teacher, {
      format: "xlsx",
      subjectId: secondSubject.id,
    });

    expect(response.status).toBe(200);

    const rows = readRows(buffer);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.subject_code === secondSubject.code)).toBe(
      true,
    );
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(
        `^attachment; filename="soal-${secondSubject.code.toLowerCase()}-\\d{8}-\\d{6}\\.xlsx"$`,
      ),
    );
  });

  it("scope filter → TEACHER hanya soal miliknya, ADMIN semua", async () => {
    const prefix = `Export Scope ${randomUUID()}`;
    const teacherTexts = [`${prefix} guru satu`, `${prefix} guru dua`];
    const otherTexts = [
      `${prefix} lain satu`,
      `${prefix} lain dua`,
      `${prefix} lain tiga`,
    ];

    await createQuestions(
      teacher.id,
      teacherTexts.map(
        (questionText): QuestionInput => ({
          subjectId: subject.id,
          type: "TRUE_FALSE",
          questionText,
          difficulty: "EASY",
          points: 1,
          correctAnswer: false,
        }),
      ),
    );

    await createQuestions(
      otherTeacher.id,
      otherTexts.map(
        (questionText): QuestionInput => ({
          subjectId: subject.id,
          type: "ESSAY",
          questionText,
          difficulty: "MEDIUM",
          points: 2,
        }),
      ),
    );

    const asTeacher = await fetchExport(teacher, {
      format: "xlsx",
      search: prefix,
    });
    const asAdmin = await fetchExport(admin, {
      format: "xlsx",
      search: prefix,
    });

    expect(asTeacher.response.status).toBe(200);
    expect(asAdmin.response.status).toBe(200);

    const teacherRows = readRows(asTeacher.buffer);
    const adminRows = readRows(asAdmin.buffer);

    expect(teacherRows).toHaveLength(2);
    expect(teacherRows.map((row) => row.question).sort()).toEqual(
      [...teacherTexts].sort(),
    );

    expect(adminRows).toHaveLength(5);
    expect(adminRows.map((row) => row.question).sort()).toEqual(
      [...teacherTexts, ...otherTexts].sort(),
    );
  });

  it("safety cap → export melebihi batas mengembalikan 400", async () => {
    process.env.EXPORT_MAX_QUESTIONS = "5";

    const prefix = `Export Cap ${randomUUID()}`;

    await createQuestions(
      teacher.id,
      Array.from({ length: 6 }, (_, index) => ({
        subjectId: subject.id,
        type: "ESSAY" as const,
        questionText: `${prefix} ${index + 1}`,
        difficulty: "MEDIUM" as const,
        points: 1,
      })),
    );

    const { response, buffer } = await fetchExport(teacher, {
      format: "xlsx",
      search: prefix,
    });
    const body = JSON.parse(buffer.toString("utf8")) as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toContain("melebihi 5 soal");
    expect(body.message).toContain("Persempit filter");
  });
});
