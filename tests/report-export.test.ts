import { randomUUID } from "node:crypto";
import type { AttemptStatus, Role } from "@prisma/client";
import { PDFParse } from "pdf-parse";
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

import { GET as exportReport } from "@/app/api/reports/[examId]/export/route";
import { RESULT_EXPORT_HEADERS } from "@/lib/exporters/report-xlsx";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

const RUN = randomUUID().slice(0, 8);
const PREFIX = `ReportExport ${RUN}`;
const BASE = new Date("2026-03-01T00:00:00.000Z");

let teacher: TestUser;
let subjectId: string;

const createdUsers: string[] = [];
const createdExams: string[] = [];
const createdAttempts: string[] = [];

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

function exportContext(examId: string) {
  return { params: Promise.resolve({ examId }) };
}

async function createUser(
  label: string,
  role: Role,
  classroom: string | null = null,
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX} ${label} ${randomUUID().slice(0, 4)}`,
      email: `report-export-${RUN}-${randomUUID()}@test.local`,
      role,
      classroom,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      classroom: true,
    },
  });

  createdUsers.push(user.id);

  return user;
}

async function createExam(titleSuffix: string) {
  const exam = await prisma.exam.create({
    data: {
      title: `${PREFIX} ${titleSuffix}`,
      subjectId,
      ownerId: teacher.id,
      durationMinutes: 90,
      startAt: BASE,
      endAt: new Date(BASE.getTime() + 2 * 60 * 60 * 1000),
      token: `RE${randomUUID().replace(/-/g, "").slice(0, 8)}`.toUpperCase(),
      status: "PUBLISHED",
      publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    },
  });

  createdExams.push(exam.id);

  return exam;
}

async function createAttempt(
  examId: string,
  studentId: string,
  options: { status?: AttemptStatus; totalScore?: number | null } = {},
) {
  const status = options.status ?? "GRADED";
  const attempt = await prisma.attempt.create({
    data: {
      examId,
      studentId,
      status,
      startedAt: BASE,
      expiresAt: new Date(BASE.getTime() + 60 * 60_000),
      submittedAt:
        status === "IN_PROGRESS"
          ? null
          : new Date(BASE.getTime() + 30 * 60_000),
      receivedAt:
        status === "IN_PROGRESS"
          ? null
          : new Date(BASE.getTime() + 30 * 60_000),
      gradedAt:
        status === "GRADED"
          ? new Date(BASE.getTime() + 45 * 60_000)
          : null,
      gradedById: status === "GRADED" ? teacher.id : null,
      totalScore:
        options.totalScore === undefined
          ? status === "GRADED"
            ? 50
            : null
          : options.totalScore,
      maxScore: 100,
      questionOrder: [],
    },
  });

  createdAttempts.push(attempt.id);

  return attempt;
}

async function fetchExport(examId: string, query: string) {
  actAs(teacher);
  const response = await exportReport(
    new Request(`http://localhost/api/reports/${examId}/export?${query}`),
    exportContext(examId),
  );
  const buffer = Buffer.from(await response.arrayBuffer());

  return { response, buffer };
}

function readRows(buffer: Buffer): (string | number)[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["results"];

  expect(sheet).toBeDefined();

  return XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
}

beforeAll(async () => {
  teacher = await createUser("Teacher", "TEACHER");

  const subject = await prisma.subject.create({
    data: {
      name: `${PREFIX} Subject`,
      code: `REX-${RUN}`.toUpperCase(),
      ownerId: teacher.id,
    },
  });

  subjectId = subject.id;
});

afterAll(async () => {
  delete process.env.EXPORT_MAX_ATTEMPTS;
  delete process.env.EXPORT_MAX_PDF_ATTEMPTS;

  await prisma.attempt.deleteMany({ where: { id: { in: createdAttempts } } });
  await prisma.exam.deleteMany({ where: { id: { in: createdExams } } });
  await prisma.subject.deleteMany({
    where: { code: `REX-${RUN}`.toUpperCase() },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
});

describe("Gate 3 — export integrity", () => {
  it("E1 XLSX 10 GRADED → 10 baris data + header tetap", async () => {
    const exam = await createExam("Sepuluh Attempt");

    for (let index = 0; index < 10; index += 1) {
      const student = await createUser(
        `Siswa ${String(index + 1).padStart(2, "0")}`,
        "STUDENT",
        "XII IPA 1",
      );

      await createAttempt(exam.id, student.id, {
        status: "GRADED",
        totalScore: (index + 1) * 10,
      });
    }

    const { response, buffer } = await fetchExport(
      exam.id,
      "format=xlsx",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="hasil-[a-z0-9-]+-\d{8}-\d{6}\.xlsx"$/,
    );

    const rows = readRows(buffer);

    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual([...RESULT_EXPORT_HEADERS]);

    const header = rows[0] as string[];

    expect(header.indexOf("Late")).toBe(6);
    expect(header.indexOf("Total")).toBe(7);
    expect(header.indexOf("Max")).toBe(8);
    expect(header.indexOf("Persentase (%)")).toBe(9);
  });

  it("E2 kolom Total/Max/Persentase numerik, Late tetap index 6", async () => {
    const exam = await createExam("Numeric Score");
    const student = await createUser("Numeric", "STUDENT", "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 80,
    });

    const { buffer } = await fetchExport(exam.id, "format=xlsx");
    const rows = readRows(buffer);
    const header = rows[0] as string[];
    const row = rows[1];

    expect(row[header.indexOf("Late")]).toBe("Tidak");
    expect(typeof row[header.indexOf("Total")]).toBe("number");
    expect(typeof row[header.indexOf("Max")]).toBe("number");
    expect(typeof row[header.indexOf("Persentase (%)")]).toBe("number");
    expect(row[header.indexOf("Total")]).toBe(80);
    expect(row[header.indexOf("Persentase (%)")]).toBe(80);
  });

  it("E3 exam kosong → export tetap 200 dengan header saja", async () => {
    const exam = await createExam("Kosong");
    const { response, buffer } = await fetchExport(exam.id, "format=xlsx");

    expect(response.status).toBe(200);

    const rows = readRows(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([...RESULT_EXPORT_HEADERS]);
  });

  it("E4 round-trip SheetJS: sheet results + nilai baris valid", async () => {
    const exam = await createExam("Round Trip");
    const student = await createUser("Round Trip Siswa", "STUDENT", "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 75,
    });

    const { buffer } = await fetchExport(exam.id, "format=xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toEqual(["results"]);

    const rows = readRows(buffer);

    expect(rows[1][0]).toBe(1);
    expect(rows[1][1]).toBe(student.name);
    expect(rows[1][2]).toBe("XII IPA 1");
    expect(rows[1][5]).toBe("Sudah dinilai");
    expect(rows[1][6]).toBe("Tidak");
    expect(rows[1][7]).toBe(75);
    expect(rows[1][8]).toBe(100);
    expect(rows[1][9]).toBe(75);
    expect(rows[1][11]).toBe(teacher.name);
  });

  it("E5 PDF → magic bytes %PDF-, A4 landscape, teks terbaca", async () => {
    const exam = await createExam("PDF Layout");
    const student = await createUser("PDF Siswa", "STUDENT", "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 88,
    });

    const { response, buffer } = await fetchExport(exam.id, "format=pdf");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="hasil-[a-z0-9-]+-\d{8}-\d{6}\.pdf"$/,
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const parser = new PDFParse({ data: buffer });

    try {
      const parsed = await parser.getText();
      const info = await parser.getInfo({ parsePageInfo: true });
      const normalized = parsed.text.replace(/\s+/g, " ");

      expect(normalized).toContain(exam.title);
      expect(normalized).toContain(student.name);
      expect(normalized).toContain("Hasil Ujian");
      expect(info.total).toBeGreaterThanOrEqual(1);
      expect(info.pages[0].width).toBeGreaterThan(info.pages[0].height);
    } finally {
      await parser.destroy();
    }
  });

  it("E6 cap export: XLSX 400 dan PDF 400 dengan hint XLSX", async () => {
    const exam = await createExam("Cap");
    const students = await Promise.all([
      createUser("Cap 1", "STUDENT", "XII IPA 1"),
      createUser("Cap 2", "STUDENT", "XII IPA 1"),
      createUser("Cap 3", "STUDENT", "XII IPA 1"),
    ]);

    for (const student of students) {
      await createAttempt(exam.id, student.id, {
        status: "GRADED",
        totalScore: 50,
      });
    }

    process.env.EXPORT_MAX_ATTEMPTS = "2";
    process.env.EXPORT_MAX_PDF_ATTEMPTS = "2";

    const xlsx = await fetchExport(exam.id, "format=xlsx");

    expect(xlsx.response.status).toBe(400);

    const xlsxBody = JSON.parse(xlsx.buffer.toString("utf8")) as {
      message: string;
    };

    expect(xlsxBody.message).toContain("melebihi 2 attempt");
    expect(xlsxBody.message).toContain("Persempit filter");

    const pdf = await fetchExport(exam.id, "format=pdf");

    expect(pdf.response.status).toBe(400);

    const pdfBody = JSON.parse(pdf.buffer.toString("utf8")) as {
      message: string;
    };

    expect(pdfBody.message).toContain("Gunakan XLSX untuk data lengkap");
  });

  it("E7 filter classroom ikut terbawa ke export XLSX", async () => {
    const exam = await createExam("Filter Classroom");
    const ipa = await createUser("Filter Ipa", "STUDENT", "XII IPA 1");
    const ips = await createUser("Filter Ips", "STUDENT", "XII IPS 2");

    await createAttempt(exam.id, ipa.id, {
      status: "GRADED",
      totalScore: 90,
    });
    await createAttempt(exam.id, ips.id, {
      status: "GRADED",
      totalScore: 40,
    });

    const { response, buffer } = await fetchExport(
      exam.id,
      `format=xlsx&classroom=${encodeURIComponent("XII IPA 1")}`,
    );

    expect(response.status).toBe(200);

    const rows = readRows(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe(ipa.name);
    expect(rows[1][2]).toBe("XII IPA 1");
    expect(rows.some((row) => row[1] === ips.name)).toBe(false);
  });
});
