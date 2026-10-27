import { randomUUID } from "node:crypto";
import type { Difficulty, QuestionType, Role } from "@prisma/client";
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

import { PATCH as patchAnswerRoute } from "@/app/api/attempts/[id]/answers/[examQuestionId]/route";
import { GET as getAttemptRoute } from "@/app/api/attempts/[id]/route";
import { GET as getResultRoute } from "@/app/api/attempts/[id]/result/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { GET as getTimeRoute } from "@/app/api/attempts/[id]/time/route";
import { POST as joinRoute } from "@/app/api/attempts/join/route";
import { GET as listAttemptsRoute } from "@/app/api/attempts/route";
import { POST as closeExam } from "@/app/api/exams/[id]/close/route";
import { POST as publishExam } from "@/app/api/exams/[id]/publish/route";
import { PUT as setExamQuestions } from "@/app/api/exams/[id]/questions/route";
import { GET as getExam } from "@/app/api/exams/[id]/route";
import { POST as createExam } from "@/app/api/exams/route";
import { gradeAnswer, normalizeShortAnswer } from "@/lib/attempts/grade";
import { shuffleInPlace } from "@/lib/attempts/shuffle";
import { prisma } from "@/lib/prisma";
import type { ExamSnapshot } from "@/lib/zod-schemas/exam";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

type ApiBody = Record<string, unknown>;

type QuestionSeed = {
  subjectId: string;
  ownerId: string;
  type: QuestionType;
  questionText: string;
  explanation?: string | null;
  difficulty?: Difficulty;
  points?: number;
  options?: { label: string; text: string; isCorrect: boolean; order: number }[];
};

let teacher: TestUser;
let student: TestUser;
let otherStudent: TestUser;
let subjectId: string;

const questionIds: Record<string, string> = {};

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
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function attemptContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function answerContext(id: string, examQuestionId: string) {
  return { params: Promise.resolve({ id, examQuestionId }) };
}

async function readBody(response: Response): Promise<ApiBody> {
  return (await response.json()) as ApiBody;
}

function examPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return {
    title: `Ujian Attempt ${randomUUID()}`,
    subjectId,
    durationMinutes: 90,
    startAt: new Date(now - 60 * 60 * 1000).toISOString(),
    endAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    shuffleQuestions: false,
    shuffleOptions: false,
    showResult: true,
    ...overrides,
  };
}

async function createQuestion(seed: QuestionSeed) {
  return prisma.question.create({
    data: {
      subjectId: seed.subjectId,
      ownerId: seed.ownerId,
      type: seed.type,
      questionText: seed.questionText,
      explanation: seed.explanation ?? "Pembahasan uji.",
      difficulty: seed.difficulty ?? "EASY",
      points: seed.points ?? 1,
      options: { create: seed.options ?? [] },
    },
  });
}

async function createExamAs(
  user: TestUser,
  overrides: Record<string, unknown> = {},
) {
  actAs(user);
  const response = await createExam(
    jsonRequest("/api/exams", "POST", examPayload(overrides)),
  );

  return { response, body: await readBody(response) };
}

async function setQuestionsAs(
  user: TestUser,
  examId: string,
  questions: { questionId: string; pointsOverride?: number | null }[],
) {
  actAs(user);
  const response = await setExamQuestions(
    jsonRequest(`/api/exams/${examId}/questions`, "PUT", { questions }),
    attemptContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function publishAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await publishExam(
    new Request(`http://localhost/api/exams/${examId}/publish`, {
      method: "POST",
    }),
    attemptContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function closeAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await closeExam(
    new Request(`http://localhost/api/exams/${examId}/close`, {
      method: "POST",
    }),
    attemptContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function getExamAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await getExam(
    new Request(`http://localhost/api/exams/${examId}`),
    attemptContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function createDraftExam(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await createExamAs(teacher, overrides);

  expect(created.response.status).toBe(201);

  return String(created.body.id);
}

async function createPublishedExam(options: {
  questionIds?: string[];
  questions?: { questionId: string; pointsOverride?: number | null }[];
  durationMinutes?: number;
  startAt?: string;
  endAt?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResult?: boolean;
} = {}) {
  const created = await createExamAs(teacher, {
    ...(options.durationMinutes !== undefined
      ? { durationMinutes: options.durationMinutes }
      : {}),
    ...(options.startAt !== undefined ? { startAt: options.startAt } : {}),
    ...(options.endAt !== undefined ? { endAt: options.endAt } : {}),
    ...(options.shuffleQuestions !== undefined
      ? { shuffleQuestions: options.shuffleQuestions }
      : {}),
    ...(options.shuffleOptions !== undefined
      ? { shuffleOptions: options.shuffleOptions }
      : {}),
    ...(options.showResult !== undefined
      ? { showResult: options.showResult }
      : {}),
  });

  expect(created.response.status).toBe(201);

  const examId = String(created.body.id);
  const items =
    options.questions ??
    (options.questionIds ?? Object.values(questionIds)).map((questionId) => ({
      questionId,
    }));
  const set = await setQuestionsAs(teacher, examId, items);

  expect(set.response.status).toBe(200);

  const published = await publishAs(teacher, examId);

  expect(published.response.status).toBe(200);

  return {
    examId,
    token: String(published.body.token),
    detail: published.body,
  };
}

async function joinAs(user: TestUser, token: string) {
  actAs(user);
  const response = await joinRoute(
    jsonRequest("/api/attempts/join", "POST", { token }),
  );

  return { response, body: await readBody(response) };
}

async function getAttemptAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await getAttemptRoute(
    new Request(`http://localhost/api/attempts/${attemptId}`),
    attemptContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function patchAnswerAs(
  user: TestUser,
  attemptId: string,
  examQuestionId: string,
  body: unknown,
) {
  actAs(user);
  const response = await patchAnswerRoute(
    jsonRequest(
      `/api/attempts/${attemptId}/answers/${examQuestionId}`,
      "PATCH",
      body,
    ),
    answerContext(attemptId, examQuestionId),
  );

  return { response, body: await readBody(response) };
}

async function submitAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await submitRoute(
    new Request(`http://localhost/api/attempts/${attemptId}/submit`, {
      method: "POST",
    }),
    attemptContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function timeAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await getTimeRoute(
    new Request(`http://localhost/api/attempts/${attemptId}/time`),
    attemptContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function resultAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await getResultRoute(
    new Request(`http://localhost/api/attempts/${attemptId}/result`),
    attemptContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function listAttemptsAs(user: TestUser) {
  actAs(user);
  const response = await listAttemptsRoute();

  return { response, body: await readBody(response) };
}

async function expireAttempt(attemptId: string, offsetMs = -1_000) {
  const expiresAt = new Date(Date.now() + offsetMs);

  await prisma.attempt.update({
    where: { id: attemptId },
    data: { expiresAt },
  });

  return expiresAt;
}

function findQuestionView(
  detail: ApiBody,
  type: string,
): Record<string, unknown> {
  const questions = detail.questions as Record<string, unknown>[];
  const question = questions.find((item) => {
    const snapshot = item.snapshot as Record<string, unknown> | null;

    return snapshot?.type === type;
  });

  if (!question) {
    throw new Error(`Question view ${type} tidak ditemukan`);
  }

  return question as Record<string, unknown>;
}

function questionIdFromView(view: Record<string, unknown>) {
  return String(view.id);
}

function assertNoKey(value: unknown, forbidden: string): void {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoKey(item, forbidden));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      expect(key).not.toBe(forbidden);
      assertNoKey(child, forbidden);
    }
  }
}

beforeAll(async () => {
  const suffix = randomUUID();

  teacher = await prisma.user.create({
    data: {
      name: "Guru Attempt Vitest",
      email: `vitest-attempt-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  student = await prisma.user.create({
    data: {
      name: "Siswa Attempt Vitest",
      email: `vitest-attempt-student-${suffix}@example.com`,
      role: "STUDENT",
      emailVerified: true,
    },
  });

  otherStudent = await prisma.user.create({
    data: {
      name: "Siswa Attempt Lain",
      email: `vitest-attempt-other-${suffix}@example.com`,
      role: "STUDENT",
      emailVerified: true,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      name: `Matematika Attempt ${suffix}`,
      code: `MAT-${suffix.slice(0, 8)}`,
      ownerId: teacher.id,
    },
  });
  subjectId = subject.id;

  const single = await createQuestion({
    subjectId,
    ownerId: teacher.id,
    type: "SINGLE_CHOICE",
    questionText: "Hasil dari 2 + 2 adalah ...",
    points: 2,
    options: [
      { label: "A", text: "3", isCorrect: false, order: 1 },
      { label: "B", text: "4", isCorrect: true, order: 2 },
      { label: "C", text: "5", isCorrect: false, order: 3 },
    ],
  });

  const multi = await createQuestion({
    subjectId,
    ownerId: teacher.id,
    type: "MULTIPLE_CHOICE",
    questionText: "Manakah bilangan prima?",
    points: 3,
    options: [
      { label: "A", text: "2", isCorrect: true, order: 1 },
      { label: "B", text: "4", isCorrect: false, order: 2 },
      { label: "C", text: "5", isCorrect: true, order: 3 },
    ],
  });

  const trueFalse = await createQuestion({
    subjectId,
    ownerId: teacher.id,
    type: "TRUE_FALSE",
    questionText: "7 adalah bilangan prima.",
    points: 1,
    options: [
      { label: "A", text: "Benar", isCorrect: true, order: 1 },
      { label: "B", text: "Salah", isCorrect: false, order: 2 },
    ],
  });

  const shortAnswer = await createQuestion({
    subjectId,
    ownerId: teacher.id,
    type: "SHORT_ANSWER",
    questionText: "Sebutkan ibu kota Indonesia.",
    explanation: "Pembahasan short rahasia.",
    points: 2,
    options: [
      { label: "KUNCI-1", text: "Jakarta", isCorrect: true, order: 1 },
    ],
  });

  const essay = await createQuestion({
    subjectId,
    ownerId: teacher.id,
    type: "ESSAY",
    questionText: "Jelaskan langkah menyelesaikan 2x + 4 = 10.",
    explanation: "Pembahasan essay rahasia.",
    points: 5,
    options: [],
  });

  questionIds.single = single.id;
  questionIds.multi = multi.id;
  questionIds.trueFalse = trueFalse.id;
  questionIds.short = shortAnswer.id;
  questionIds.essay = essay.id;
});

afterAll(async () => {
  const studentIds = [student.id, otherStudent.id];

  await prisma.attempt.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.exam.deleteMany({ where: { ownerId: teacher.id } });
  await prisma.question.deleteMany({ where: { ownerId: teacher.id } });
  await prisma.subject.deleteMany({ where: { ownerId: teacher.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [teacher.id, student.id, otherStudent.id] } },
  });

  const leftovers = await prisma.attempt.count({
    where: { studentId: { in: studentIds } },
  });

  expect(leftovers).toBe(0);
  await prisma.$disconnect();
});

describe("Gate A — timer + join window", () => {
  it("A1 join valid dalam window → expiresAt = startedAt + duration", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
      durationMinutes: 90,
    });
    const before = Date.now();
    const joined = await joinAs(student, exam.token);
    const after = Date.now();

    expect(joined.response.status).toBe(201);
    expect(joined.body.status).toBe("IN_PROGRESS");

    const expires = Date.parse(String(joined.body.expiresAt));

    expect(expires).toBeGreaterThanOrEqual(before + 90 * 60_000 - 2_000);
    expect(expires).toBeLessThanOrEqual(after + 90 * 60_000 + 2_000);

    const attempt = await getAttemptAs(student, String(joined.body.attemptId));

    expect(attempt.response.status).toBe(200);
    const started = Date.parse(String(attempt.body.startedAt));

    expect(Math.abs(expires - (started + 90 * 60_000))).toBeLessThan(2_000);
  });

  it("A2 join dekat endAt → expiresAt dipotong ke exam.endAt", async () => {
    const endAt = new Date(Date.now() + 30 * 60_000);
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
      durationMinutes: 90,
      endAt: endAt.toISOString(),
    });
    const joined = await joinAs(student, exam.token);

    expect(joined.response.status).toBe(201);
    expect(
      Math.abs(Date.parse(String(joined.body.expiresAt)) - endAt.getTime()),
    ).toBeLessThan(2_000);
  });

  it("A3 join sebelum startAt → 403", async () => {
    const now = Date.now();
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
      startAt: new Date(now + 10 * 60_000).toISOString(),
      endAt: new Date(now + 60 * 60_000).toISOString(),
    });
    const joined = await joinAs(student, exam.token);

    expect(joined.response.status).toBe(403);
    expect(joined.body.message).toMatch(/belum dimulai/i);
  });

  it("A4 join setelah endAt tanpa attempt → 403 meski PUBLISHED", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });

    await prisma.exam.update({
      where: { id: exam.examId },
      data: {
        startAt: new Date(Date.now() - 2 * 60 * 60_000),
        endAt: new Date(Date.now() - 60 * 60_000),
      },
    });

    const joined = await joinAs(student, exam.token);

    expect(joined.response.status).toBe(403);
    expect(joined.body.message).toMatch(/berakhir/i);
  });

  it("A5 join exam DRAFT → 403", async () => {
    const examId = await createDraftExam();
    const token = "DRAFTX";

    await prisma.exam.update({ where: { id: examId }, data: { token } });

    const joined = await joinAs(student, token);

    expect(joined.response.status).toBe(403);
    expect(joined.body.message).toMatch(/tidak sedang berlangsung/i);
  });

  it("A6 join exam CLOSED tanpa attempt → 403", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const closed = await closeAs(teacher, exam.examId);

    expect(closed.response.status).toBe(200);

    const joined = await joinAs(student, exam.token);

    expect(joined.response.status).toBe(403);
  });

  it("A7 autosave setelah expiresAt → 403 dan DB tidak berubah", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await expireAttempt(attemptId);

    const saved = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });

    expect(saved.response.status).toBe(403);
    expect(saved.body.message).toMatch(/habis/i);

    const count = await prisma.answer.count({ where: { attemptId } });

    expect(count).toBe(0);
  });

  it("A8 submit setelah expiresAt → diterima, submittedAt = expiresAt", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });

    const expiresAt = await expireAttempt(attemptId, -60_000);
    const submitted = await submitAs(student, attemptId);

    expect(submitted.response.status).toBe(200);
    expect(submitted.body.status).toBe("GRADED");
    expect(Date.parse(String(submitted.body.submittedAt))).toBe(
      expiresAt.getTime(),
    );
    expect(Date.parse(String(submitted.body.receivedAt))).toBeGreaterThan(
      Date.parse(String(submitted.body.submittedAt)),
    );
    expect(submitted.body.totalScore).toBe(2);
  });

  it("A9 GET /time mengembalikan sisa waktu dan status yang konsisten", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const active = await timeAs(student, attemptId);

    expect(active.response.status).toBe(200);
    expect(active.body.status).toBe("IN_PROGRESS");
    expect(Number(active.body.remainingMs)).toBeGreaterThan(0);
    expect(Date.parse(String(active.body.expiresAt))).toBeGreaterThan(
      Date.parse(String(active.body.serverNow)),
    );

    await expireAttempt(attemptId, -1_000);

    const expired = await timeAs(student, attemptId);

    expect(expired.response.status).toBe(200);
    expect(expired.body.status).toBe("GRADED");
    expect(expired.body.remainingMs).toBe(0);
  });

  it("A10 submit 5 menit setelah expiry → receivedAt > submittedAt", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);

    const expiresAt = await expireAttempt(attemptId, -5 * 60_000);
    const submitted = await submitAs(student, attemptId);

    expect(submitted.response.status).toBe(200);
    expect(submitted.body.status).toBe("GRADED");
    expect(submitted.body.submittedAt).toBeTruthy();
    expect(submitted.body.receivedAt).toBeTruthy();
    expect(Date.parse(String(submitted.body.submittedAt))).toBe(
      expiresAt.getTime(),
    );
    expect(
      Date.parse(String(submitted.body.receivedAt)) -
        Date.parse(String(submitted.body.submittedAt)),
    ).toBeGreaterThanOrEqual(4 * 60_000);
  });

  it("A11 submit tepat waktu → submittedAt ≈ receivedAt", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const submitted = await submitAs(student, String(joined.body.attemptId));

    expect(submitted.response.status).toBe(200);
    expect(submitted.body.submittedAt).toBeTruthy();
    expect(submitted.body.receivedAt).toBeTruthy();
    expect(
      Math.abs(
        Date.parse(String(submitted.body.receivedAt)) -
          Date.parse(String(submitted.body.submittedAt)),
      ),
    ).toBeLessThanOrEqual(1_000);
  });
});

describe("Gate B — autosave revision-safe", () => {
  it("B1 autosave pertama membuat Answer dan revision 1", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    const saved = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });

    expect(saved.response.status).toBe(200);
    expect(saved.body.updated).toBe(true);
    expect(saved.body.revision).toBe(1);
    expect(saved.body.answeredAt).toBeTruthy();

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId,
          examQuestionId: singleId,
        },
      },
    });

    expect(answer.selectedLabels).toEqual(["B"]);
    expect(answer.revision).toBe(1);
  });

  it("B2 autosave kedua dengan baseRevision benar menaikkan revision", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    const saved = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 1,
      selectedLabels: ["A"],
    });

    expect(saved.response.status).toBe(200);
    expect(saved.body.updated).toBe(true);
    expect(saved.body.revision).toBe(2);
    expect((saved.body.answer as ApiBody).selectedLabels).toEqual(["A"]);
  });

  it("B3 baseRevision lama → 200 stale, DB tidak berubah", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 1,
      selectedLabels: ["A"],
    });
    const stale = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 1,
      selectedLabels: ["C"],
    });

    expect(stale.response.status).toBe(200);
    expect(stale.body.updated).toBe(false);
    expect(stale.body.reason).toBe("stale");
    expect(stale.body.revision).toBe(2);
    expect((stale.body.answer as ApiBody).selectedLabels).toEqual(["A"]);
  });

  it("B4 baseRevision 0 padahal Answer sudah ada → stale", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    const stale = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["A"],
    });

    expect(stale.response.status).toBe(200);
    expect(stale.body.updated).toBe(false);
    expect(stale.body.reason).toBe("stale");

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId,
          examQuestionId: singleId,
        },
      },
    });

    expect(answer.selectedLabels).toEqual(["B"]);
  });

  it("B5 multi-answer replace, bukan merge", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.multi],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const multiId = questionIdFromView(findQuestionView(exam.detail, "MULTIPLE_CHOICE"));

    await patchAnswerAs(student, attemptId, multiId, {
      baseRevision: 0,
      selectedLabels: ["A", "C"],
    });
    const saved = await patchAnswerAs(student, attemptId, multiId, {
      baseRevision: 1,
      selectedLabels: ["C"],
    });

    expect(saved.response.status).toBe(200);
    expect((saved.body.answer as ApiBody).selectedLabels).toEqual(["C"]);
  });

  it("B6 label invalid / payload tipe salah → 400", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    const invalidLabel = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["Z"],
    });

    expect(invalidLabel.response.status).toBe(400);

    const wrongType = await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      textAnswer: "jawaban teks",
    });

    expect(wrongType.response.status).toBe(400);
  });
});

describe("Gate C — answer key isolation", () => {
  it("C1 payload siswa tidak mengandung key isCorrect", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const serialized = JSON.stringify(attempt.body);

    expect(attempt.response.status).toBe(200);
    expect(serialized).not.toMatch(/"isCorrect"\s*:/);
  });

  it("C2 payload siswa tidak mengandung key explanation", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));

    expect(JSON.stringify(attempt.body)).not.toMatch(/"explanation"\s*:/);
  });

  it("C3 payload siswa tidak mengandung correctAnswers/answerKey/score", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const serialized = JSON.stringify(attempt.body);

    expect(serialized).not.toMatch(/"correctAnswers"\s*:/);
    expect(serialized).not.toMatch(/"answerKey"\s*:/);
    expect(serialized).not.toMatch(/"score"\s*:/);
  });

  it("C4 recursive traversal tidak menemukan key terlarang", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));

    for (const key of [
      "isCorrect",
      "explanation",
      "correctAnswers",
      "answerKey",
      "score",
    ]) {
      assertNoKey(attempt.body, key);
    }
  });

  it("C5 SHORT_ANSWER → options kosong dan teks kunci tidak bocor", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const questions = attempt.body.questions as ApiBody[];
    const short = questions.find((question) => question.type === "SHORT_ANSWER");

    expect(short).toBeTruthy();
    expect(short?.options).toEqual([]);
    expect(JSON.stringify(attempt.body)).not.toContain("Jakarta");
  });

  it("C6 teacher endpoint tetap mengembalikan isCorrect + explanation", async () => {
    const exam = await createPublishedExam();
    const detail = await getExamAs(teacher, exam.examId);
    const serialized = JSON.stringify(detail.body);

    expect(detail.response.status).toBe(200);
    expect(serialized).toMatch(/"isCorrect"\s*:/);
    expect(serialized).toMatch(/"explanation"\s*:/);
  });

  it("C7 setelah submit, GET attempt tidak mengembalikan questions", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);

    await submitAs(student, attemptId);
    const attempt = await getAttemptAs(student, attemptId);

    expect(attempt.response.status).toBe(200);
    expect(attempt.body.status).toBe("GRADED");
    expect(attempt.body.questions).toEqual([]);
    expect(JSON.stringify(attempt.body)).not.toMatch(/"isCorrect"\s*:/);
  });

  it("C8 setiap teks opsi SHORT_ANSWER tidak muncul di payload siswa", async () => {
    const exam = await createPublishedExam();
    const shortView = findQuestionView(exam.detail, "SHORT_ANSWER");
    const snapshot = shortView.snapshot as ApiBody;
    const keyTexts = (snapshot.options as ApiBody[]).map((option) =>
      String(option.text),
    );
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const serialized = JSON.stringify(attempt.body);

    expect(keyTexts.length).toBeGreaterThan(0);
    keyTexts.forEach((text) => {
      expect(serialized).not.toContain(text);
    });
  });

  it("C9 ESSAY → options array eksplisit kosong", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const questions = attempt.body.questions as ApiBody[];
    const essay = questions.find((question) => question.type === "ESSAY");

    expect(essay).toBeTruthy();
    expect(Array.isArray(essay?.options)).toBe(true);
    expect(essay?.options).toEqual([]);
  });
});

describe("Gate D — shuffle reproducibility", () => {
  it("D1 shuffleQuestions → questionOrder persisten dan GET 2x identik", async () => {
    const exam = await createPublishedExam({ shuffleQuestions: true });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const first = await getAttemptAs(student, attemptId);
    const second = await getAttemptAs(student, attemptId);
    const expectedIds = (exam.detail.questions as ApiBody[]).map((question) =>
      String(question.id),
    );
    const order = first.body.questionOrder as string[];

    expect(order).toHaveLength(expectedIds.length);
    expect(new Set(order)).toEqual(new Set(expectedIds));
    expect(second.body.questionOrder).toEqual(order);
    expect(
      (second.body.questions as ApiBody[]).map((question) =>
        String(question.examQuestionId),
      ),
    ).toEqual(order);
  });

  it("D2 tanpa shuffleQuestions → questionOrder mengikuti ExamQuestion.order", async () => {
    const exam = await createPublishedExam({ shuffleQuestions: false });
    const joined = await joinAs(student, exam.token);
    const attempt = await getAttemptAs(student, String(joined.body.attemptId));
    const expected = (exam.detail.questions as ApiBody[]).map((question) =>
      String(question.id),
    );

    expect(attempt.body.questionOrder).toEqual(expected);
  });

  it("D3 shuffleOptions → urutan opsi persisten dan TRUE_FALSE tidak di-shuffle", async () => {
    const exam = await createPublishedExam({ shuffleOptions: true });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const first = await getAttemptAs(student, attemptId);
    const second = await getAttemptAs(student, attemptId);
    const firstQuestions = first.body.questions as ApiBody[];
    const secondQuestions = second.body.questions as ApiBody[];

    expect(firstQuestions).toHaveLength(secondQuestions.length);

    for (let index = 0; index < firstQuestions.length; index += 1) {
      const a = firstQuestions[index];
      const b = secondQuestions[index];

      expect(a.options).toEqual(b.options);
    }

    const trueFalse = firstQuestions.find(
      (question) => question.type === "TRUE_FALSE",
    );

    expect(trueFalse).toBeTruthy();
    expect(
      (trueFalse?.options as ApiBody[]).map((option) => option.label),
    ).toEqual(["A", "B"]);
  });

  it("D4 tanpa shuffleOptions → optionOrder null dan opsi urutan snapshot", async () => {
    const exam = await createPublishedExam({ shuffleOptions: false });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const attempt = await getAttemptAs(student, attemptId);
    const row = await prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
    });

    expect(row.optionOrder).toBeNull();

    const single = (attempt.body.questions as ApiBody[]).find(
      (question) => question.type === "SINGLE_CHOICE",
    );

    expect((single?.options as ApiBody[]).map((option) => option.label)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("D5 Fisher-Yates dengan RNG deterministik menghasilkan permutasi", async () => {
    const source = ["A", "B", "C", "D", "E"];
    const shuffled = shuffleInPlace([...source], () => 0);

    expect([...shuffled].sort()).toEqual([...source].sort());
    expect(shuffled).toHaveLength(source.length);

    const again = shuffleInPlace([...source], () => 0);

    expect(again).toEqual(shuffled);
  });

  it("D6 questionOrder korup → 500 eksplisit, bukan re-shuffle", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);

    await prisma.$executeRaw`
      UPDATE attempts
      SET "questionOrder" = "questionOrder"[1:array_length("questionOrder", 1) - 1]
      WHERE id = ${attemptId}
    `;

    const attempt = await getAttemptAs(student, attemptId);
    const message = String(attempt.body.message);

    expect(attempt.response.status).toBe(500);
    expect(message).toMatch(/questionOrder/i);
    expect(message).toMatch(/berisi 4 id, expected 5/i);
    expect(message).toContain(`attemptId=${attemptId}`);
    expect(message).toContain(`examId=${exam.examId}`);
    expect(message).toMatch(/Hubungi admin/i);
    expect(message).not.toMatch(/at .*\.ts:\d+/);
  });

  it("D7 optionOrder korup → 500 eksplisit, bukan fallback", async () => {
    const exam = await createPublishedExam({ shuffleOptions: true });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);

    await prisma.attempt.update({
      where: { id: attemptId },
      data: { optionOrder: {} },
    });

    const attempt = await getAttemptAs(student, attemptId);
    const message = String(attempt.body.message);

    expect(attempt.response.status).toBe(500);
    expect(message).toMatch(/optionOrder/i);
    expect(message).toContain(`attemptId=${attemptId}`);
    expect(message).toContain(`examId=${exam.examId}`);
    expect(message).toMatch(/tidak tersedia|expected \d+ opsi/i);
    expect(message).toMatch(/Hubungi admin/i);
    expect(message).not.toMatch(/at .*\.ts:\d+/);
  });
});

describe("Functional — join, access, resume", () => {
  it("F1 token case-insensitive dan whitespace dinormalisasi", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, ` ${exam.token.toLowerCase()} `);

    expect(joined.response.status).toBe(201);
  });

  it("F2 token salah, DRAFT, CLOSED, jadwal null → 403/404", async () => {
    const invalid = await joinAs(student, "TIDAKA");
    expect(invalid.response.status).toBe(404);

    const draftId = await createDraftExam();
    await prisma.exam.update({
      where: { id: draftId },
      data: { token: "DRAFTY" },
    });
    const draft = await joinAs(student, "drafty");
    expect(draft.response.status).toBe(403);

    const closedExam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    await closeAs(teacher, closedExam.examId);
    const closed = await joinAs(student, closedExam.token);
    expect(closed.response.status).toBe(403);

    const nullSchedule = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    await prisma.exam.update({
      where: { id: nullSchedule.examId },
      data: { startAt: null, endAt: null },
    });
    const missing = await joinAs(student, nullSchedule.token);
    expect(missing.response.status).toBe(403);
    expect(missing.body.message).toMatch(/jadwal/i);
  });

  it("F3 double join dan join existing GRADED → 200 resume, bukan create baru", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const first = await joinAs(student, exam.token);
    const second = await joinAs(student, exam.token);

    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(200);
    expect(second.body.attemptId).toBe(first.body.attemptId);

    await submitAs(student, String(first.body.attemptId));

    const afterSubmit = await joinAs(student, exam.token);

    expect(afterSubmit.response.status).toBe(200);
    expect(afterSubmit.body.attemptId).toBe(first.body.attemptId);
    expect(afterSubmit.body.status).toBe("GRADED");

    const count = await prisma.attempt.count({
      where: { examId: exam.examId, studentId: student.id },
    });

    expect(count).toBe(1);
  });

  it("F4 ownership 404 dan TEACHER 403", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);

    const otherGet = await getAttemptAs(otherStudent, attemptId);
    expect(otherGet.response.status).toBe(404);

    const otherPatch = await patchAnswerAs(
      otherStudent,
      attemptId,
      questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE")),
      { baseRevision: 0, selectedLabels: ["B"] },
    );
    expect(otherPatch.response.status).toBe(404);

    const otherSubmit = await submitAs(otherStudent, attemptId);
    expect(otherSubmit.response.status).toBe(404);

    const teacherGet = await getAttemptAs(teacher, attemptId);
    expect(teacherGet.response.status).toBe(403);
  });

  it("F5 resume mengembalikan jawaban, urutan, dan expiresAt yang sama", async () => {
    const exam = await createPublishedExam();
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const first = await getAttemptAs(student, attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));
    const multiId = questionIdFromView(findQuestionView(exam.detail, "MULTIPLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    await patchAnswerAs(student, attemptId, multiId, {
      baseRevision: 0,
      selectedLabels: ["A", "C"],
    });

    const resumed = await getAttemptAs(student, attemptId);
    const questions = resumed.body.questions as ApiBody[];
    const single = questions.find((question) => question.type === "SINGLE_CHOICE");
    const multi = questions.find((question) => question.type === "MULTIPLE_CHOICE");

    expect(resumed.body.questionOrder).toEqual(first.body.questionOrder);
    expect(resumed.body.expiresAt).toBe(first.body.expiresAt);
    expect((single?.answer as ApiBody).selectedLabels).toEqual(["B"]);
    expect((multi?.answer as ApiBody).selectedLabels).toEqual(["A", "C"]);
  });

  it("F6 list hanya attempt sendiri dan tidak membocorkan token", async () => {
    const examMine = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const examOther = await createPublishedExam({
      questionIds: [questionIds.multi],
    });

    await joinAs(student, examMine.token);
    await joinAs(otherStudent, examOther.token);

    const listed = await listAttemptsAs(student);
    const items = listed.body.items as ApiBody[];

    expect(listed.response.status).toBe(200);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.examId !== examOther.examId)).toBe(true);
    expect(JSON.stringify(listed.body)).not.toContain(examMine.token);
    expect(JSON.stringify(listed.body)).not.toContain(examOther.token);
  });

  it("F7 result gating showResult + status SUBMITTED/GRADED", async () => {
    const hidden = await createPublishedExam({
      questionIds: [questionIds.single],
      showResult: false,
    });
    const hiddenJoin = await joinAs(student, hidden.token);
    await submitAs(student, String(hiddenJoin.body.attemptId));
    const hiddenResult = await resultAs(student, String(hiddenJoin.body.attemptId));

    expect(hiddenResult.response.status).toBe(403);

    const graded = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const gradedJoin = await joinAs(student, graded.token);
    const singleId = questionIdFromView(findQuestionView(graded.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, String(gradedJoin.body.attemptId), singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    await submitAs(student, String(gradedJoin.body.attemptId));
    const gradedResult = await resultAs(student, String(gradedJoin.body.attemptId));

    expect(gradedResult.response.status).toBe(200);
    expect(gradedResult.body.status).toBe("GRADED");
    expect(gradedResult.body.totalScore).toBe(2);
    expect(gradedResult.body.maxScore).toBe(2);

    const pending = await createPublishedExam({
      questionIds: [questionIds.single, questionIds.essay],
    });
    const pendingJoin = await joinAs(student, pending.token);
    await submitAs(student, String(pendingJoin.body.attemptId));
    const pendingResult = await resultAs(
      student,
      String(pendingJoin.body.attemptId),
    );

    expect(pendingResult.response.status).toBe(200);
    expect(pendingResult.body.status).toBe("SUBMITTED");
    expect(pendingResult.body.totalScore).toBeNull();
    expect(pendingResult.body.message).toMatch(/menunggu/i);
  });

  it("F8 concurrent lazy-finalize + submit → 200 idempotent, tanpa double-grade", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const joined = await joinAs(student, exam.token);
    const attemptId = String(joined.body.attemptId);
    const singleId = questionIdFromView(findQuestionView(exam.detail, "SINGLE_CHOICE"));

    await patchAnswerAs(student, attemptId, singleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    await expireAttempt(attemptId, -1_000);

    // Kedua handler dijalankan bersamaan (bukan sequential). Race nyata
    // ditentukan oleh conditional updateMany + transaksi Postgres.
    const [lazy, submitted] = await Promise.all([
      getAttemptAs(student, attemptId),
      submitAs(student, attemptId),
    ]);

    expect(lazy.response.status).toBe(200);
    expect(submitted.response.status).toBe(200);
    expect(lazy.body.status).toBe("GRADED");
    expect(submitted.body.status).toBe("GRADED");
    expect(lazy.body.totalScore).toBe(2);
    expect(submitted.body.totalScore).toBe(2);
    expect(lazy.body.submittedAt).toBe(submitted.body.submittedAt);
    expect(lazy.body.gradedAt).toBe(submitted.body.gradedAt);
    expect(lazy.body.questions).toEqual([]);

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId,
          examQuestionId: singleId,
        },
      },
    });

    expect(answer.score).toBe(2);

    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: attemptId },
    });

    expect(attempt.totalScore).toBe(2);
    expect(attempt.submittedAt?.toISOString()).toBe(
      submitted.body.submittedAt,
    );
    expect(attempt.receivedAt).toBeTruthy();
  });
});

describe("Functional — grading", () => {
  it("G1 tanpa jawaban, single benar/salah, dan maxScore override", async () => {
    const empty = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const emptyJoin = await joinAs(student, empty.token);
    const emptySubmit = await submitAs(student, String(emptyJoin.body.attemptId));

    expect(emptySubmit.body.status).toBe("GRADED");
    expect(emptySubmit.body.totalScore).toBe(0);

    const correct = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const correctJoin = await joinAs(student, correct.token);
    const correctSingleId = questionIdFromView(
      findQuestionView(correct.detail, "SINGLE_CHOICE"),
    );

    await patchAnswerAs(
      student,
      String(correctJoin.body.attemptId),
      correctSingleId,
      { baseRevision: 0, selectedLabels: ["B"] },
    );
    const correctSubmit = await submitAs(
      student,
      String(correctJoin.body.attemptId),
    );

    expect(correctSubmit.body.totalScore).toBe(2);

    const wrong = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const wrongJoin = await joinAs(student, wrong.token);
    const wrongSingleId = questionIdFromView(
      findQuestionView(wrong.detail, "SINGLE_CHOICE"),
    );

    await patchAnswerAs(student, String(wrongJoin.body.attemptId), wrongSingleId, {
      baseRevision: 0,
      selectedLabels: ["A"],
    });
    const wrongSubmit = await submitAs(student, String(wrongJoin.body.attemptId));

    expect(wrongSubmit.body.totalScore).toBe(0);

    const override = await createPublishedExam({
      questions: [
        { questionId: questionIds.single, pointsOverride: 7 },
        { questionId: questionIds.multi, pointsOverride: 4 },
      ],
    });
    const overrideJoin = await joinAs(student, override.token);
    const overrideAttempt = await getAttemptAs(
      student,
      String(overrideJoin.body.attemptId),
    );

    expect(overrideAttempt.body.maxScore).toBe(11);
  });

  it("G2 multi all-or-nothing, true/false, dan normalisasi short answer", async () => {
    const multiPartial = await createPublishedExam({
      questionIds: [questionIds.multi],
    });
    const partialJoin = await joinAs(student, multiPartial.token);
    const partialMultiId = questionIdFromView(
      findQuestionView(multiPartial.detail, "MULTIPLE_CHOICE"),
    );

    await patchAnswerAs(
      student,
      String(partialJoin.body.attemptId),
      partialMultiId,
      { baseRevision: 0, selectedLabels: ["A"] },
    );
    const partialSubmit = await submitAs(
      student,
      String(partialJoin.body.attemptId),
    );

    expect(partialSubmit.body.totalScore).toBe(0);

    const multiFull = await createPublishedExam({
      questionIds: [questionIds.multi],
    });
    const fullJoin = await joinAs(student, multiFull.token);
    const fullMultiId = questionIdFromView(
      findQuestionView(multiFull.detail, "MULTIPLE_CHOICE"),
    );

    await patchAnswerAs(student, String(fullJoin.body.attemptId), fullMultiId, {
      baseRevision: 0,
      selectedLabels: ["A", "C"],
    });
    const fullSubmit = await submitAs(student, String(fullJoin.body.attemptId));

    expect(fullSubmit.body.totalScore).toBe(3);

    const trueFalse = await createPublishedExam({
      questionIds: [questionIds.trueFalse],
    });
    const tfJoin = await joinAs(student, trueFalse.token);
    const tfId = questionIdFromView(findQuestionView(trueFalse.detail, "TRUE_FALSE"));

    await patchAnswerAs(student, String(tfJoin.body.attemptId), tfId, {
      baseRevision: 0,
      selectedLabels: ["A"],
    });
    const tfSubmit = await submitAs(student, String(tfJoin.body.attemptId));

    expect(tfSubmit.body.totalScore).toBe(1);

    const shortAnswer = await createPublishedExam({
      questionIds: [questionIds.short],
    });
    const shortJoin = await joinAs(student, shortAnswer.token);
    const shortId = questionIdFromView(
      findQuestionView(shortAnswer.detail, "SHORT_ANSWER"),
    );

    await patchAnswerAs(student, String(shortJoin.body.attemptId), shortId, {
      baseRevision: 0,
      textAnswer: " Jakarta ",
    });
    const shortSubmit = await submitAs(student, String(shortJoin.body.attemptId));

    expect(shortSubmit.body.totalScore).toBe(2);

    const punctuation = await createPublishedExam({
      questionIds: [questionIds.short],
    });
    const punctuationJoin = await joinAs(student, punctuation.token);
    const punctuationId = questionIdFromView(
      findQuestionView(punctuation.detail, "SHORT_ANSWER"),
    );

    await patchAnswerAs(
      student,
      String(punctuationJoin.body.attemptId),
      punctuationId,
      { baseRevision: 0, textAnswer: "Jakarta!" },
    );
    const punctuationSubmit = await submitAs(
      student,
      String(punctuationJoin.body.attemptId),
    );

    expect(punctuationSubmit.body.totalScore).toBe(0);

    expect(normalizeShortAnswer("  Jakarta  ")).toBe("jakarta");
    expect(normalizeShortAnswer("3,14")).toBe("3,14");
    expect(normalizeShortAnswer("3,14")).not.toBe(
      normalizeShortAnswer("314"),
    );

    const snapshot: ExamSnapshot = {
      version: 1,
      questionId: "q",
      subjectId: "s",
      type: "SHORT_ANSWER",
      questionText: "Ibu kota?",
      explanation: null,
      difficulty: "EASY",
      points: 2,
      options: [
        {
          label: "KUNCI-1",
          text: "Jakarta",
          isCorrect: true,
          order: 1,
        },
      ],
      capturedAt: new Date().toISOString(),
      sourceUpdatedAt: new Date().toISOString(),
    };

    expect(
      gradeAnswer(snapshot, { selectedLabels: [], textAnswer: " JAKARTA " }, 2),
    ).toEqual({ isCorrect: true, score: 2 });
    expect(
      gradeAnswer(snapshot, { selectedLabels: [], textAnswer: "Bandung" }, 2),
    ).toEqual({ isCorrect: false, score: 0 });
  });

  it("G3 essay SUBMITTED, essay kosong, dan double submit idempotent", async () => {
    const essayExam = await createPublishedExam({
      questionIds: [questionIds.single, questionIds.essay],
    });
    const essayJoin = await joinAs(student, essayExam.token);
    const essayAttemptId = String(essayJoin.body.attemptId);
    const essaySingleId = questionIdFromView(
      findQuestionView(essayExam.detail, "SINGLE_CHOICE"),
    );
    const essayId = questionIdFromView(findQuestionView(essayExam.detail, "ESSAY"));

    await patchAnswerAs(student, essayAttemptId, essaySingleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });
    await patchAnswerAs(student, essayAttemptId, essayId, {
      baseRevision: 0,
      textAnswer: "Kurangi 4 lalu bagi 2 sehingga x = 3.",
    });

    const essaySubmit = await submitAs(student, essayAttemptId);

    expect(essaySubmit.body.status).toBe("SUBMITTED");
    expect(essaySubmit.body.totalScore).toBeNull();
    expect(essaySubmit.body.submittedAt).toBeTruthy();

    const essayAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: essayAttemptId,
          examQuestionId: essayId,
        },
      },
    });

    expect(essayAnswer.score).toBeNull();
    expect(essayAnswer.isCorrect).toBeNull();

    const blankEssay = await createPublishedExam({
      questionIds: [questionIds.single, questionIds.essay],
    });
    const blankJoin = await joinAs(student, blankEssay.token);
    const blankSubmit = await submitAs(student, String(blankJoin.body.attemptId));

    expect(blankSubmit.body.status).toBe("SUBMITTED");

    const double = await createPublishedExam({
      questionIds: [questionIds.single],
    });
    const doubleJoin = await joinAs(student, double.token);
    const doubleAttemptId = String(doubleJoin.body.attemptId);
    const doubleSingleId = questionIdFromView(
      findQuestionView(double.detail, "SINGLE_CHOICE"),
    );

    await patchAnswerAs(student, doubleAttemptId, doubleSingleId, {
      baseRevision: 0,
      selectedLabels: ["B"],
    });

    const first = await submitAs(student, doubleAttemptId);
    const second = await submitAs(student, doubleAttemptId);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(second.body.status).toBe(first.body.status);
    expect(second.body.totalScore).toBe(first.body.totalScore);

    const doubleAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: doubleAttemptId,
          examQuestionId: doubleSingleId,
        },
      },
    });

    expect(doubleAnswer.score).toBe(2);

    const doubleAttempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: doubleAttemptId },
    });

    expect(doubleAttempt.totalScore).toBe(2);
  });
});
