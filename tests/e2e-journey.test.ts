import { randomUUID } from "node:crypto";
import type { QuestionType } from "@prisma/client";
import * as XLSX from "xlsx";
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

import { GET as getAnalytics } from "@/app/api/reports/[examId]/analytics/route";
import { GET as exportReport } from "@/app/api/reports/[examId]/export/route";
import { GET as getReport } from "@/app/api/reports/[examId]/route";
import { PATCH as patchAnswer } from "@/app/api/attempts/[id]/answers/[examQuestionId]/route";
import { POST as submitAttempt } from "@/app/api/attempts/[id]/submit/route";
import { POST as joinAttempt } from "@/app/api/attempts/join/route";
import { GET as getGrading } from "@/app/api/grading/[attemptId]/route";
import { PUT as putEssayScore } from "@/app/api/grading/[attemptId]/essays/[examQuestionId]/route";
import { POST as closeExam } from "@/app/api/exams/[id]/close/route";
import { PUT as setExamQuestions } from "@/app/api/exams/[id]/questions/route";
import { POST as publishExam } from "@/app/api/exams/[id]/publish/route";
import { POST as createExam } from "@/app/api/exams/route";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  classroom: string | null;
};

type QuestionSeed = {
  type: QuestionType;
  questionText: string;
  points?: number;
  options?: { label: string; text: string; isCorrect: boolean; order: number }[];
};

const RUN = randomUUID().slice(0, 8);
const PREFIX = `E2E Journey ${RUN}`;

let teacher: TestUser;
let student: TestUser;
let subjectId: string;
let examId: string;
let examToken: string;
let attemptId: string;
let examQuestions: { id: string; order: number }[];

const createdUserIds: string[] = [];
const createdQuestionIds: string[] = [];

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

function examContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function answerContext(id: string, examQuestionId: string) {
  return { params: Promise.resolve({ id, examQuestionId }) };
}

function gradingContext(attemptId: string) {
  return { params: Promise.resolve({ attemptId }) };
}

function scoreContext(attemptId: string, examQuestionId: string) {
  return { params: Promise.resolve({ attemptId, examQuestionId }) };
}

function exportContext(examId: string) {
  return { params: Promise.resolve({ examId }) };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createUser(
  label: string,
  role: "TEACHER" | "STUDENT",
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX} ${label}`,
      email: `e2e-${RUN}-${randomUUID()}@test.local`,
      role,
      classroom: role === "STUDENT" ? "XII IPA 1" : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      classroom: true,
    },
  });

  createdUserIds.push(user.id);

  return user;
}

async function createQuestion(seed: QuestionSeed) {
  const question = await prisma.question.create({
    data: {
      subjectId,
      ownerId: teacher.id,
      type: seed.type,
      questionText: seed.questionText,
      points: seed.points ?? 1,
      options: { create: seed.options ?? [] },
    },
  });

  createdQuestionIds.push(question.id);

  return question;
}

beforeAll(async () => {
  teacher = await createUser("Guru", "TEACHER");
  student = await createUser("Siswa", "STUDENT");

  const subject = await prisma.subject.create({
    data: {
      name: `${PREFIX} Subject`,
      code: `E2E-${RUN}`.toUpperCase(),
      ownerId: teacher.id,
    },
  });

  subjectId = subject.id;

  const questions = [
    await createQuestion({
      type: "SINGLE_CHOICE",
      questionText: "2 + 2 = ?",
      options: [
        { label: "A", text: "4", isCorrect: true, order: 1 },
        { label: "B", text: "5", isCorrect: false, order: 2 },
      ],
    }),
    await createQuestion({
      type: "SINGLE_CHOICE",
      questionText: "Ibu kota Indonesia?",
      options: [
        { label: "A", text: "Bandung", isCorrect: false, order: 1 },
        { label: "B", text: "Jakarta", isCorrect: true, order: 2 },
      ],
    }),
    await createQuestion({
      type: "TRUE_FALSE",
      questionText: "Air mendidih pada 100°C di tekanan normal.",
      options: [
        { label: "A", text: "Benar", isCorrect: true, order: 1 },
        { label: "B", text: "Salah", isCorrect: false, order: 2 },
      ],
    }),
    await createQuestion({
      type: "SHORT_ANSWER",
      questionText: "Sebutkan ibu kota Indonesia.",
      options: [
        { label: "KUNCI-1", text: "Jakarta", isCorrect: true, order: 1 },
      ],
    }),
    await createQuestion({
      type: "ESSAY",
      questionText: "Jelaskan proses fotosintesis.",
      points: 5,
    }),
  ];

  actAs(teacher);
  const created = await createExam(
    jsonRequest("/api/exams", "POST", {
      title: `${PREFIX} Exam`,
      subjectId,
      durationMinutes: 90,
      startAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      endAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      shuffleQuestions: false,
      shuffleOptions: false,
      showResult: true,
    }),
  );

  expect(created.status).toBe(201);

  const examBody = await readJson<{ id: string }>(created);
  examId = examBody.id;

  const set = await setExamQuestions(
    jsonRequest(`/api/exams/${examId}/questions`, "PUT", {
      questions: questions.map((question) => ({ questionId: question.id })),
    }),
    examContext(examId),
  );

  expect(set.status).toBe(200);

  const published = await publishExam(
    jsonRequest(`/api/exams/${examId}/publish`, "POST"),
    examContext(examId),
  );

  expect(published.status).toBe(200);

  const publishedBody = await readJson<{
    token: string;
    publishedBy: { id: string } | null;
  }>(published);

  expect(publishedBody.publishedBy?.id).toBe(teacher.id);

  examQuestions = await prisma.examQuestion.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  examToken = publishedBody.token;
});

afterAll(async () => {
  await prisma.attempt.deleteMany({ where: { examId } });
  await prisma.exam.deleteMany({ where: { id: examId } });
  await prisma.question.deleteMany({
    where: { id: { in: createdQuestionIds } },
  });
  await prisma.subject.deleteMany({ where: { code: `E2E-${RUN}`.toUpperCase() } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

  await prisma.$disconnect();
});

describe("A10b — full journey backend", () => {
  it(
    "login → join → answer → submit → grade → report → export → analytics",
    async () => {
      const token = examToken;
      expect(token).toBeTruthy();

      actAs(student);
      const joined = await joinAttempt(
        jsonRequest("/api/attempts/join", "POST", { token }),
      );

      expect(joined.status).toBe(201);

      const joinBody = await readJson<{ attemptId: string; status: string }>(
        joined,
      );
      attemptId = joinBody.attemptId;

      expect(joinBody.status).toBe("IN_PROGRESS");

      // Q1 benar, Q2 salah, Q3 benar, Q4 benar, Q5 esai.
      const answers: {
        index: number;
        payload: Record<string, unknown>;
      }[] = [
        { index: 0, payload: { selectedLabels: ["A"] } },
        { index: 1, payload: { selectedLabels: ["A"] } },
        { index: 2, payload: { selectedLabels: ["A"] } },
        { index: 3, payload: { textAnswer: "Jakarta" } },
        {
          index: 4,
          payload: { textAnswer: "Fotosintesis mengubah cahaya menjadi energi." },
        },
      ];

      for (const answer of answers) {
        const examQuestion = examQuestions[answer.index];
        const saved = await patchAnswer(
          jsonRequest(
            `/api/attempts/${attemptId}/answers/${examQuestion.id}`,
            "PATCH",
            { baseRevision: 0, ...answer.payload },
          ),
          answerContext(attemptId, examQuestion.id),
        );

        expect(saved.status).toBe(200);
      }

      const submitted = await submitAttempt(
        jsonRequest(`/api/attempts/${attemptId}/submit`, "POST"),
        examContext(attemptId),
      );

      expect(submitted.status).toBe(200);
      expect(
        (await readJson<{ status: string }>(submitted)).status,
      ).toBe("SUBMITTED");

      actAs(teacher);
      const grading = await getGrading(
        new Request(`http://localhost/api/grading/${attemptId}`),
        gradingContext(attemptId),
      );

      expect(grading.status).toBe(200);

      const gradingBody = await readJson<{
        essays: {
          examQuestionId: string;
          answer: { revision: number } | null;
        }[];
      }>(grading);
      const essay = gradingBody.essays[0];

      expect(essay).toBeDefined();

      const graded = await putEssayScore(
        jsonRequest(
          `/api/grading/${attemptId}/essays/${essay.examQuestionId}`,
          "PUT",
          { score: 4, baseRevision: essay.answer?.revision ?? 0 },
        ),
        scoreContext(attemptId, essay.examQuestionId),
      );

      expect(graded.status).toBe(200);

      const report = await getReport(
        new Request(`http://localhost/api/reports/${examId}`),
        exportContext(examId),
      );

      expect(report.status).toBe(200);

      const reportBody = await readJson<{
        exam: { publishedBy: { id: string } | null };
        stats: {
          totalAttempts: number;
          byStatus: { graded: number };
          graded: { count: number; avgScore: number | null };
        };
      }>(report);

      expect(reportBody.exam.publishedBy?.id).toBe(teacher.id);
      expect(reportBody.stats.totalAttempts).toBe(1);
      expect(reportBody.stats.byStatus.graded).toBe(1);
      expect(reportBody.stats.graded.count).toBe(1);
      expect(reportBody.stats.graded.avgScore).toBe(7);

      const xlsxResponse = await exportReport(
        new Request(
          `http://localhost/api/reports/${examId}/export?format=xlsx`,
        ),
        exportContext(examId),
      );
      const xlsxBuffer = Buffer.from(await xlsxResponse.arrayBuffer());
      const workbook = XLSX.read(xlsxBuffer, { type: "buffer" });
      const sheet = workbook.Sheets.results;
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
      });

      expect(xlsxResponse.status).toBe(200);
      expect(rows[0][1]).toBe("Nama Siswa");
      expect(rows[1][1]).toBe(student.name);
      expect(rows[1][7]).toBe(7);
      expect(rows[1][8]).toBe(9);

      const pdfResponse = await exportReport(
        new Request(
          `http://localhost/api/reports/${examId}/export?format=pdf`,
        ),
        exportContext(examId),
      );
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      expect(pdfResponse.status).toBe(200);
      expect(pdfBuffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

      const analytics = await getAnalytics(
        new Request(`http://localhost/api/reports/${examId}/analytics`),
        exportContext(examId),
      );
      const analyticsBody = await readJson<{
        summary: { gradedAttempts: number; warnings: string[] };
        items: {
          examQuestionId: string;
          pValue: number | null;
          discrimination: number | null;
          distribution: { key: string; count: number }[];
        }[];
      }>(analytics);

      expect(analytics.status).toBe(200);
      expect(analyticsBody.summary.gradedAttempts).toBe(1);
      expect(analyticsBody.summary.warnings).toEqual(["sample_too_small"]);

      const byQuestion = new Map(
        analyticsBody.items.map((item) => [item.examQuestionId, item]),
      );
      const q1 = byQuestion.get(examQuestions[0].id);
      const q2 = byQuestion.get(examQuestions[1].id);
      const q4 = byQuestion.get(examQuestions[3].id);
      const essayItem = byQuestion.get(examQuestions[4].id);

      expect(q1?.pValue).toBe(1);
      expect(q2?.pValue).toBe(0);
      expect(q4?.pValue).toBe(1);
      expect(essayItem?.discrimination).toBeNull();
      expect(
        essayItem?.distribution.find((entry) => entry.key === "scored")?.count,
      ).toBe(1);

      actAs(teacher);
      const closed = await closeExam(
        jsonRequest(`/api/exams/${examId}/close`, "POST"),
        examContext(examId),
      );

      expect(closed.status).toBe(200);

      const closedRow = await prisma.exam.findUniqueOrThrow({
        where: { id: examId },
        select: { publishedById: true, closedById: true },
      });

      expect(closedRow.publishedById).toBe(teacher.id);
      expect(closedRow.closedById).toBe(teacher.id);
    },
    30_000,
  );
});
