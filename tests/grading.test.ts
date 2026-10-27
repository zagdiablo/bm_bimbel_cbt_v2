import { randomUUID } from "node:crypto";
import {
  Prisma,
  type Difficulty,
  type QuestionType,
  type Role,
} from "@prisma/client";
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

import { GET as listGradingRoute } from "@/app/api/grading/route";
import { GET as getGradingRoute } from "@/app/api/grading/[attemptId]/route";
import { PUT as putEssayScoreRoute } from "@/app/api/grading/[attemptId]/essays/[examQuestionId]/route";
import { PUT as putShortAnswerScoreRoute } from "@/app/api/grading/[attemptId]/short-answers/[examQuestionId]/route";
import { PATCH as patchAnswerRoute } from "@/app/api/attempts/[id]/answers/[examQuestionId]/route";
import { GET as getResultRoute } from "@/app/api/attempts/[id]/result/route";
import { POST as submitRoute } from "@/app/api/attempts/[id]/submit/route";
import { POST as joinRoute } from "@/app/api/attempts/join/route";
import { POST as closeExam } from "@/app/api/exams/[id]/close/route";
import { POST as publishExam } from "@/app/api/exams/[id]/publish/route";
import { PUT as setExamQuestions } from "@/app/api/exams/[id]/questions/route";
import { POST as createExam } from "@/app/api/exams/route";
import { prisma } from "@/lib/prisma";

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

let teacherA: TestUser;
let teacherB: TestUser;
let admin: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let subjectAId: string;
let subjectBId: string;

const questionIds: Record<string, string> = {};
const lazyStudentIds: string[] = [];

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

function attemptContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function gradingContext(attemptId: string) {
  return { params: Promise.resolve({ attemptId }) };
}

function scoreContext(attemptId: string, examQuestionId: string) {
  return { params: Promise.resolve({ attemptId, examQuestionId }) };
}

function answerContext(id: string, examQuestionId: string) {
  return { params: Promise.resolve({ id, examQuestionId }) };
}

async function readBody(response: Response): Promise<ApiBody> {
  return (await response.json()) as ApiBody;
}

function examPayload(subjectId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return {
    title: `Ujian Grading ${randomUUID()}`,
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
  subjectId: string,
  overrides: Record<string, unknown> = {},
) {
  actAs(user);
  const response = await createExam(
    jsonRequest("/api/exams", "POST", examPayload(subjectId, overrides)),
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

async function createPublishedExam(options: {
  owner?: TestUser;
  subjectId?: string;
  questions?: { questionId: string; pointsOverride?: number | null }[];
  questionIds?: string[];
  showResult?: boolean;
}) {
  const owner = options.owner ?? teacherA;
  const subjectId = options.subjectId ?? subjectAId;
  const created = await createExamAs(owner, subjectId, {
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
  const set = await setQuestionsAs(owner, examId, items);

  expect(set.response.status).toBe(200);

  const published = await publishAs(owner, examId);

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

async function resultAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await getResultRoute(
    new Request(`http://localhost/api/attempts/${attemptId}/result`),
    attemptContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function listGradingAs(user: TestUser, search = "") {
  actAs(user);
  const response = await listGradingRoute(
    new Request(`http://localhost/api/grading${search}`),
  );

  return { response, body: await readBody(response) };
}

async function getGradingAs(user: TestUser, attemptId: string) {
  actAs(user);
  const response = await getGradingRoute(
    new Request(`http://localhost/api/grading/${attemptId}`),
    gradingContext(attemptId),
  );

  return { response, body: await readBody(response) };
}

async function putEssayAs(
  user: TestUser,
  attemptId: string,
  examQuestionId: string,
  body: unknown,
) {
  actAs(user);
  const response = await putEssayScoreRoute(
    jsonRequest(
      `/api/grading/${attemptId}/essays/${examQuestionId}`,
      "PUT",
      body,
    ),
    scoreContext(attemptId, examQuestionId),
  );

  return { response, body: await readBody(response) };
}

async function putShortAnswerAs(
  user: TestUser,
  attemptId: string,
  examQuestionId: string,
  body: unknown,
) {
  actAs(user);
  const response = await putShortAnswerScoreRoute(
    jsonRequest(
      `/api/grading/${attemptId}/short-answers/${examQuestionId}`,
      "PUT",
      body,
    ),
    scoreContext(attemptId, examQuestionId),
  );

  return { response, body: await readBody(response) };
}

async function examQuestionIdFor(examId: string, questionId: string) {
  const row = await prisma.examQuestion.findFirstOrThrow({
    where: { examId, questionId },
    select: { id: true },
  });

  return row.id;
}

async function createSubmittedAttempt(options: {
  owner?: TestUser;
  subjectId?: string;
  questionIds: string[];
  student?: TestUser;
  answers?: {
    questionId: string;
    selectedLabels?: string[];
    textAnswer?: string;
  }[];
  showResult?: boolean;
}) {
  const owner = options.owner ?? teacherA;
  const student = options.student ?? studentA;
  const exam = await createPublishedExam({
    owner,
    subjectId: options.subjectId,
    questionIds: options.questionIds,
    showResult: options.showResult,
  });
  const joined = await joinAs(student, exam.token);

  expect(joined.response.status).toBe(201);

  const attemptId = String(joined.body.attemptId);

  for (const answer of options.answers ?? []) {
    const examQuestionId = await examQuestionIdFor(
      exam.examId,
      answer.questionId,
    );
    const saved = await patchAnswerAs(student, attemptId, examQuestionId, {
      baseRevision: 0,
      ...(answer.selectedLabels !== undefined
        ? { selectedLabels: answer.selectedLabels }
        : {}),
      ...(answer.textAnswer !== undefined
        ? { textAnswer: answer.textAnswer }
        : {}),
    });

    expect(saved.response.status).toBe(200);
  }

  const submitted = await submitAs(student, attemptId);

  expect(submitted.response.status).toBe(200);

  return { ...exam, attemptId, submitted };
}

beforeAll(async () => {
  const suffix = randomUUID();

  teacherA = await prisma.user.create({
    data: {
      name: "Guru Grading A",
      email: `vitest-grading-teacher-a-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });
  teacherB = await prisma.user.create({
    data: {
      name: "Guru Grading B",
      email: `vitest-grading-teacher-b-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });
  admin = await prisma.user.create({
    data: {
      name: "Admin Grading",
      email: `vitest-grading-admin-${suffix}@example.com`,
      role: "ADMIN",
      emailVerified: true,
    },
  });
  studentA = await prisma.user.create({
    data: {
      name: "Siswa Grading A",
      email: `vitest-grading-student-a-${suffix}@example.com`,
      role: "STUDENT",
      classroom: "XII IPA 1",
      emailVerified: true,
    },
  });
  studentB = await prisma.user.create({
    data: {
      name: "Siswa Grading B",
      email: `vitest-grading-student-b-${suffix}@example.com`,
      role: "STUDENT",
      classroom: "XII IPA 2",
      emailVerified: true,
    },
  });

  const subjectA = await prisma.subject.create({
    data: {
      name: `Matematika Grading ${suffix}`,
      code: `GRD-A-${suffix.slice(0, 8)}`,
      ownerId: teacherA.id,
    },
  });
  const subjectB = await prisma.subject.create({
    data: {
      name: `Bahasa Grading ${suffix}`,
      code: `GRD-B-${suffix.slice(0, 8)}`,
      ownerId: teacherB.id,
    },
  });
  subjectAId = subjectA.id;
  subjectBId = subjectB.id;

  const single = await createQuestion({
    subjectId: subjectAId,
    ownerId: teacherA.id,
    type: "SINGLE_CHOICE",
    questionText: "Hasil dari 2 + 2 adalah ...",
    points: 2,
    options: [
      { label: "A", text: "3", isCorrect: false, order: 1 },
      { label: "B", text: "4", isCorrect: true, order: 2 },
      { label: "C", text: "5", isCorrect: false, order: 3 },
    ],
  });
  const essay1 = await createQuestion({
    subjectId: subjectAId,
    ownerId: teacherA.id,
    type: "ESSAY",
    questionText: "Jelaskan langkah menyelesaikan 2x + 4 = 10.",
    explanation: "Kurangi 4 lalu bagi 2.",
    points: 5,
  });
  const essay2 = await createQuestion({
    subjectId: subjectAId,
    ownerId: teacherA.id,
    type: "ESSAY",
    questionText: "Jelaskan mengapa 7 adalah bilangan prima.",
    explanation: "Hanya habis dibagi 1 dan 7.",
    points: 4,
  });
  const essaySnapshot = await createQuestion({
    subjectId: subjectAId,
    ownerId: teacherA.id,
    type: "ESSAY",
    questionText: "Teks snapshot asli.",
    explanation: "Pembahasan snapshot asli.",
    points: 5,
  });
  const short = await createQuestion({
    subjectId: subjectAId,
    ownerId: teacherA.id,
    type: "SHORT_ANSWER",
    questionText: "Sebutkan ibu kota Indonesia.",
    explanation: "Jakarta.",
    points: 2,
    options: [
      { label: "KUNCI-1", text: "Jakarta", isCorrect: true, order: 1 },
    ],
  });
  const essayB = await createQuestion({
    subjectId: subjectBId,
    ownerId: teacherB.id,
    type: "ESSAY",
    questionText: "Essay milik guru B.",
    explanation: "Pembahasan guru B.",
    points: 3,
  });

  questionIds.single = single.id;
  questionIds.essay1 = essay1.id;
  questionIds.essay2 = essay2.id;
  questionIds.essaySnapshot = essaySnapshot.id;
  questionIds.short = short.id;
  questionIds.essayB = essayB.id;
});

afterAll(async () => {
  const studentIds = [studentA.id, studentB.id, ...lazyStudentIds];

  await prisma.attempt.deleteMany({
    where: { studentId: { in: studentIds } },
  });
  await prisma.exam.deleteMany({
    where: { ownerId: { in: [teacherA.id, teacherB.id] } },
  });
  await prisma.question.deleteMany({
    where: { ownerId: { in: [teacherA.id, teacherB.id] } },
  });
  await prisma.subject.deleteMany({
    where: { ownerId: { in: [teacherA.id, teacherB.id] } },
  });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          teacherA.id,
          teacherB.id,
          admin.id,
          studentA.id,
          studentB.id,
          ...lazyStudentIds,
        ],
      },
    },
  });

  await prisma.$disconnect();
});

describe("Gate 1 — snapshot-only grading", () => {
  it("G1.1 grading reads snapshot, not live question", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.essaySnapshot],
    });
    const joined = await joinAs(studentA, exam.token);
    const attemptId = String(joined.body.attemptId);

    await submitAs(studentA, attemptId);
    await prisma.question.update({
      where: { id: questionIds.essaySnapshot },
      data: {
        questionText: "TEKS LIVE BARU",
        explanation: "PEMBAHASAN LIVE BARU",
        points: 99,
      },
    });

    const detail = await getGradingAs(teacherA, attemptId);
    const essay = (detail.body.essays as ApiBody[])[0];

    expect(detail.response.status).toBe(200);
    expect(essay.questionText).toBe("Teks snapshot asli.");
    expect(essay.explanation).toBe("Pembahasan snapshot asli.");
    expect(essay.points).toBe(5);
  });

  it("G1.2 snapshot null → GET and PUT 500 explicit", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.essay1],
    });
    const joined = await joinAs(studentA, exam.token);
    const attemptId = String(joined.body.attemptId);
    const examQuestionId = await examQuestionIdFor(
      exam.examId,
      questionIds.essay1,
    );

    await submitAs(studentA, attemptId);
    await prisma.examQuestion.update({
      where: { id: examQuestionId },
      data: { snapshotJson: Prisma.DbNull },
    });

    const detail = await getGradingAs(teacherA, attemptId);
    const message = String(detail.body.message);

    expect(detail.response.status).toBe(500);
    expect(message).toMatch(/snapshot/i);
    expect(message).toContain(`examQuestionId=${examQuestionId}`);

    const saved = await putEssayAs(teacherA, attemptId, examQuestionId, {
      score: 0,
      baseRevision: 0,
    });

    expect(saved.response.status).toBe(500);
    expect(String(saved.body.message)).toMatch(/snapshot/i);
  });

  it("G1.3 invalid snapshot shape → 500 explicit", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.essay1],
    });
    const joined = await joinAs(studentA, exam.token);
    const attemptId = String(joined.body.attemptId);
    const examQuestionId = await examQuestionIdFor(
      exam.examId,
      questionIds.essay1,
    );

    await submitAs(studentA, attemptId);
    await prisma.examQuestion.update({
      where: { id: examQuestionId },
      data: { snapshotJson: { version: 1, broken: true } },
    });

    const detail = await getGradingAs(teacherA, attemptId);

    expect(detail.response.status).toBe(500);
    expect(String(detail.body.message)).toMatch(/snapshot.*tidak valid/i);
    expect(String(detail.body.message)).toContain(
      `examQuestionId=${examQuestionId}`,
    );
  });

  it("G1.4 pointsOverride caps essay score and maxScore", async () => {
    const exam = await createPublishedExam({
      questions: [{ questionId: questionIds.essay1, pointsOverride: 3 }],
    });
    const joined = await joinAs(studentA, exam.token);
    const attemptId = String(joined.body.attemptId);
    const examQuestionId = await examQuestionIdFor(
      exam.examId,
      questionIds.essay1,
    );

    await submitAs(studentA, attemptId);

    const tooHigh = await putEssayAs(teacherA, attemptId, examQuestionId, {
      score: 4,
      baseRevision: 0,
    });

    expect(tooHigh.response.status).toBe(400);
    expect(String(tooHigh.body.message)).toMatch(/antara 0 dan 3/i);

    const accepted = await putEssayAs(teacherA, attemptId, examQuestionId, {
      score: 3,
      baseRevision: 0,
    });

    expect(accepted.response.status).toBe(200);
    expect((accepted.body.attempt as ApiBody).maxScore).toBe(3);
    expect((accepted.body.attempt as ApiBody).totalScore).toBe(3);
    expect((accepted.body.attempt as ApiBody).status).toBe("GRADED");
  });

  it("G1.5 objective answer with null score → 500 integrity", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1],
      answers: [{ questionId: questionIds.single, selectedLabels: ["B"] }],
    });
    const singleId = await examQuestionIdFor(
      submitted.examId,
      questionIds.single,
    );
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    await prisma.answer.update({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: singleId,
        },
      },
      data: { score: null },
    });

    const saved = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essayId,
      { score: 1, baseRevision: 0 },
    );

    expect(saved.response.status).toBe(500);
    expect(String(saved.body.message)).toMatch(/belum memiliki nilai/i);
    expect(String(saved.body.message)).toContain(`examQuestionId=${singleId}`);
  });
});

describe("Gate 2 — recompute and transition", () => {
  it("G2.1 partial essay grade stays SUBMITTED and recomputes total", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1, questionIds.essay2],
      answers: [
        { questionId: questionIds.single, selectedLabels: ["B"] },
        { questionId: questionIds.essay1, textAnswer: "Jawaban essay 1" },
        { questionId: questionIds.essay2, textAnswer: "Jawaban essay 2" },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const saved = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essay1Id,
      { score: 3, baseRevision: 1 },
    );

    expect(saved.response.status).toBe(200);
    expect((saved.body.attempt as ApiBody).status).toBe("SUBMITTED");
    expect((saved.body.attempt as ApiBody).totalScore).toBe(5);
    expect((saved.body.attempt as ApiBody).gradedAt).toBeNull();
    expect((saved.body.summary as ApiBody).pendingEssayCount).toBe(1);

    const row = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });

    expect(row.totalScore).toBe(5);
    expect(row.gradedAt).toBeNull();
  });

  it("G2.2 last essay grade transitions to GRADED once", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1, questionIds.essay2],
      answers: [
        { questionId: questionIds.single, selectedLabels: ["B"] },
        { questionId: questionIds.essay1, textAnswer: "Jawaban essay 1" },
        { questionId: questionIds.essay2, textAnswer: "Jawaban essay 2" },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const essay2Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay2,
    );

    await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 3,
      baseRevision: 1,
    });
    const last = await putEssayAs(teacherA, submitted.attemptId, essay2Id, {
      score: 4,
      baseRevision: 1,
    });

    expect(last.response.status).toBe(200);
    expect((last.body.attempt as ApiBody).status).toBe("GRADED");
    expect((last.body.attempt as ApiBody).totalScore).toBe(9);
    expect((last.body.attempt as ApiBody).gradedAt).toBeTruthy();
    expect((last.body.attempt as ApiBody).gradedById).toBe(teacherA.id);
    expect((last.body.summary as ApiBody).pendingEssayCount).toBe(0);

    const row = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });

    expect(row.status).toBe("GRADED");
    expect(row.gradedAt).toBeTruthy();
    expect(row.gradedById).toBe(teacherA.id);
    expect(row.totalScore).toBe(9);
  });

  it("G2.3 (#27) blank essay creates placeholder with answeredAt = submittedAt", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const essay2Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay2,
    );

    expect(submitted.submitted.body.status).toBe("SUBMITTED");

    const first = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essay1Id,
      { score: 0, baseRevision: 0 },
    );

    expect(first.response.status).toBe(200);
    expect((first.body.attempt as ApiBody).status).toBe("SUBMITTED");

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essay1Id,
        },
      },
    });
    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });

    expect(answer.textAnswer).toBeNull();
    expect(answer.selectedLabels).toEqual([]);
    expect(answer.score).toBe(0);
    expect(answer.revision).toBe(1);
    expect(answer.isCorrect).toBeNull();
    expect(
      Math.abs(answer.answeredAt.getTime() - attempt.submittedAt!.getTime()),
    ).toBeLessThan(1_000);

    const last = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essay2Id,
      { score: 0, baseRevision: 0 },
    );

    expect(last.response.status).toBe(200);
    expect((last.body.attempt as ApiBody).status).toBe("GRADED");
    expect((last.body.attempt as ApiBody).totalScore).toBe(0);
  });

  it("G2.4 all essays score 0 → GRADED with objective total", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1, questionIds.essay2],
      answers: [{ questionId: questionIds.single, selectedLabels: ["B"] }],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const essay2Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay2,
    );

    await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 0,
      baseRevision: 0,
    });
    const last = await putEssayAs(teacherA, submitted.attemptId, essay2Id, {
      score: 0,
      baseRevision: 0,
    });

    expect(last.response.status).toBe(200);
    expect((last.body.attempt as ApiBody).status).toBe("GRADED");
    expect((last.body.attempt as ApiBody).totalScore).toBe(2);
  });

  it("G2.5 repeated save is idempotent and bumps revision", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
      answers: [{ questionId: questionIds.essay1, textAnswer: "Jawaban" }],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const first = await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 2,
      baseRevision: 1,
    });

    expect(first.response.status).toBe(200);

    const second = await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 2,
      baseRevision: 2,
    });

    expect(second.response.status).toBe(200);
    expect((second.body.attempt as ApiBody).status).toBe("SUBMITTED");
    expect((second.body.attempt as ApiBody).totalScore).toBe(2);

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essay1Id,
        },
      },
    });

    expect(answer.revision).toBe(3);
    expect(answer.score).toBe(2);
  });

  it("G2.6 totalScore invariant after every save", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1, questionIds.essay2],
      answers: [
        { questionId: questionIds.single, selectedLabels: ["B"] },
        { questionId: questionIds.essay1, textAnswer: "Satu" },
        { questionId: questionIds.essay2, textAnswer: "Dua" },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 3,
      baseRevision: 1,
    });

    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
      include: { answers: { select: { score: true } } },
    });
    const sum = attempt.answers.reduce(
      (total, answer) => total + (answer.score ?? 0),
      0,
    );

    expect(attempt.totalScore).toBe(sum);
    expect(attempt.totalScore).toBeLessThanOrEqual(attempt.maxScore);
  });

  it("G2.7 object/unknown/foreign essay rejected", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1],
      answers: [{ questionId: questionIds.single, selectedLabels: ["B"] }],
    });
    const singleId = await examQuestionIdFor(
      submitted.examId,
      questionIds.single,
    );
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const objective = await putEssayAs(
      teacherA,
      submitted.attemptId,
      singleId,
      { score: 1, baseRevision: 1 },
    );

    expect(objective.response.status).toBe(400);

    const unknown = await putEssayAs(
      teacherA,
      submitted.attemptId,
      "eq_tidak_ada",
      { score: 1, baseRevision: 0 },
    );

    expect(unknown.response.status).toBe(404);

    const other = await createPublishedExam({
      owner: teacherB,
      subjectId: subjectBId,
      questionIds: [questionIds.essayB],
    });
    const otherJoin = await joinAs(studentA, other.token);
    const otherAttemptId = String(otherJoin.body.attemptId);
    await submitAs(studentA, otherAttemptId);
    const otherEssayId = await examQuestionIdFor(
      other.examId,
      questionIds.essayB,
    );

    const foreign = await putEssayAs(
      teacherA,
      otherAttemptId,
      otherEssayId,
      { score: 1, baseRevision: 0 },
    );

    expect(foreign.response.status).toBe(404);

    const ownEssayForeignQuestion = await putEssayAs(
      teacherA,
      submitted.attemptId,
      otherEssayId,
      { score: 1, baseRevision: 0 },
    );

    expect(ownEssayForeignQuestion.response.status).toBe(404);
    expect(essayId).toBeTruthy();
  });

  it("G2.8 active attempt 409, expired attempt lazily finalized then graded", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.essay1],
    });
    const joined = await joinAs(studentA, exam.token);
    const attemptId = String(joined.body.attemptId);
    const essayId = await examQuestionIdFor(exam.examId, questionIds.essay1);

    const active = await putEssayAs(teacherA, attemptId, essayId, {
      score: 1,
      baseRevision: 0,
    });

    expect(active.response.status).toBe(409);

    await prisma.attempt.update({
      where: { id: attemptId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await putEssayAs(teacherA, attemptId, essayId, {
      score: 2,
      baseRevision: 0,
    });

    expect(expired.response.status).toBe(200);
    expect((expired.body.attempt as ApiBody).status).toBe("GRADED");
    expect((expired.body.attempt as ApiBody).totalScore).toBe(2);
  });

  it("G2.9 concurrent different essays → GRADED, no stuck SUBMITTED", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
      answers: [
        { questionId: questionIds.essay1, textAnswer: "Satu" },
        { questionId: questionIds.essay2, textAnswer: "Dua" },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const essay2Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay2,
    );

    actAs(teacherA);
    const [first, second] = await Promise.all([
      putEssayAs(teacherA, submitted.attemptId, essay1Id, {
        score: 3,
        baseRevision: 1,
      }),
      putEssayAs(teacherA, submitted.attemptId, essay2Id, {
        score: 4,
        baseRevision: 1,
      }),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);

    const attempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });

    expect(attempt.status).toBe("GRADED");
    expect(attempt.totalScore).toBe(7);
    expect(attempt.gradedAt).toBeTruthy();
  });

  it("G2.10 concurrent same essay with same revision → one 409", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
      answers: [{ questionId: questionIds.essay1, textAnswer: "Satu" }],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    actAs(teacherA);
    const [first, second] = await Promise.all([
      putEssayAs(teacherA, submitted.attemptId, essay1Id, {
        score: 2,
        baseRevision: 1,
      }),
      putEssayAs(teacherA, submitted.attemptId, essay1Id, {
        score: 5,
        baseRevision: 1,
      }),
    ]);
    const statuses = [first.response.status, second.response.status].sort(
      (a, b) => a - b,
    );

    expect(statuses).toEqual([200, 409]);

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essay1Id,
        },
      },
    });

    expect([2, 5]).toContain(answer.score);
    expect(answer.revision).toBe(2);
  });

  it("G2.11 essay keeps isCorrect null and student text", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
      answers: [
        {
          questionId: questionIds.essay1,
          textAnswer: "Teks jawaban siswa tetap.",
        },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const saved = await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 3,
      baseRevision: 1,
    });

    expect(saved.response.status).toBe(200);

    const answer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essay1Id,
        },
      },
    });

    expect(answer.isCorrect).toBeNull();
    expect(answer.textAnswer).toBe("Teks jawaban siswa tetap.");
    expect(answer.gradedById).toBe(teacherA.id);
    expect(answer.gradedAt).toBeTruthy();
  });
});

describe("Gate 3 — scope and RBAC", () => {
  it("G3.1 list scopes to teacher exams, excludes GRADED, marks late", async () => {
    const examA = await createPublishedExam({
      questionIds: [questionIds.essay1],
    });
    const joinedA = await joinAs(studentA, examA.token);
    const attemptA = String(joinedA.body.attemptId);
    await submitAs(studentA, attemptA);

    const examB = await createPublishedExam({
      owner: teacherB,
      subjectId: subjectBId,
      questionIds: [questionIds.essayB],
    });
    const joinedB = await joinAs(studentA, examB.token);
    const attemptB = String(joinedB.body.attemptId);
    await submitAs(studentA, attemptB);

    const submittedAt = new Date();
    await prisma.attempt.update({
      where: { id: attemptA },
      data: { receivedAt: new Date(submittedAt.getTime() + 5 * 60_000) },
    });

    const joinedB2 = await joinAs(studentB, examA.token);
    const gradedAttempt = String(joinedB2.body.attemptId);
    const essayAId = await examQuestionIdFor(examA.examId, questionIds.essay1);
    await submitAs(studentB, gradedAttempt);
    await putEssayAs(teacherA, gradedAttempt, essayAId, {
      score: 5,
      baseRevision: 0,
    });

    const own = await listGradingAs(teacherA, `?examId=${examA.examId}`);
    const ownItems = own.body.items as ApiBody[];

    expect(own.response.status).toBe(200);
    expect(ownItems.length).toBeGreaterThan(0);
    expect(ownItems.every((item) => item.examId === examA.examId)).toBe(true);
    expect(ownItems.some((item) => item.id === gradedAttempt)).toBe(false);
    expect(ownItems.find((item) => item.id === attemptA)?.isLate).toBe(true);

    const foreign = await listGradingAs(teacherA, `?examId=${examB.examId}`);

    expect(foreign.response.status).toBe(200);
    expect(foreign.body.total).toBe(0);

    const owner = await listGradingAs(teacherB, `?examId=${examB.examId}`);

    expect(owner.response.status).toBe(200);
    expect(owner.body.total).toBe(1);
  });

  it("G3.2 teacher can grade another student's attempt for own exam", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
      student: studentB,
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const detail = await getGradingAs(teacherA, submitted.attemptId);

    expect(detail.response.status).toBe(200);
    expect((detail.body.attempt as ApiBody).student).toMatchObject({
      id: studentB.id,
    });

    const saved = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 4,
      baseRevision: 0,
    });

    expect(saved.response.status).toBe(200);
  });

  it("G3.3 teacher cannot see/grade other teacher's exam → 404", async () => {
    const examB = await createPublishedExam({
      owner: teacherB,
      subjectId: subjectBId,
      questionIds: [questionIds.essayB],
    });
    const joined = await joinAs(studentA, examB.token);
    const attemptId = String(joined.body.attemptId);
    await submitAs(studentA, attemptId);
    const essayId = await examQuestionIdFor(examB.examId, questionIds.essayB);

    const detail = await getGradingAs(teacherA, attemptId);

    expect(detail.response.status).toBe(404);

    const saved = await putEssayAs(teacherA, attemptId, essayId, {
      score: 1,
      baseRevision: 0,
    });

    expect(saved.response.status).toBe(404);

    const owner = await getGradingAs(teacherB, attemptId);

    expect(owner.response.status).toBe(200);
  });

  it("G3.4 admin can list/detail/grade all exams", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const list = await listGradingAs(admin, `?examId=${submitted.examId}`);

    expect(list.response.status).toBe(200);
    expect(
      (list.body.items as ApiBody[]).some(
        (item) => item.id === submitted.attemptId,
      ),
    ).toBe(true);

    const detail = await getGradingAs(admin, submitted.attemptId);

    expect(detail.response.status).toBe(200);

    const saved = await putEssayAs(admin, submitted.attemptId, essayId, {
      score: 5,
      baseRevision: 0,
    });

    expect(saved.response.status).toBe(200);
    expect((saved.body.attempt as ApiBody).status).toBe("GRADED");
  });

  it("G3.5 student cannot access grading APIs → 403", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const list = await listGradingAs(studentA);
    const detail = await getGradingAs(studentA, submitted.attemptId);
    const saved = await putEssayAs(
      studentA,
      submitted.attemptId,
      essayId,
      { score: 5, baseRevision: 0 },
    );

    expect(list.response.status).toBe(403);
    expect(detail.response.status).toBe(403);
    expect(saved.response.status).toBe(403);
  });

  it("G3.7 CLOSED exam remains gradable", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const closed = await closeAs(teacherA, submitted.examId);

    expect(closed.response.status).toBe(200);

    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const detail = await getGradingAs(teacherA, submitted.attemptId);
    const saved = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 5,
      baseRevision: 0,
    });

    expect(detail.response.status).toBe(200);
    expect(saved.response.status).toBe(200);
    expect((saved.body.attempt as ApiBody).status).toBe("GRADED");
  });

  it("G3.8 GRADED disappears from pending list; teacher regrade 409", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 5,
      baseRevision: 0,
    });

    const list = await listGradingAs(teacherA, `?examId=${submitted.examId}`);

    expect(
      (list.body.items as ApiBody[]).some(
        (item) => item.id === submitted.attemptId,
      ),
    ).toBe(false);

    const regrade = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 4,
      baseRevision: 2,
    });

    expect(regrade.response.status).toBe(409);
  });

  it("G3.9 (#28) admin regrade updates answer audit but not attempt gradedAt", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const first = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 4,
      baseRevision: 0,
    });

    expect(first.response.status).toBe(200);

    const before = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });
    const beforeAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essayId,
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const regrade = await putEssayAs(admin, submitted.attemptId, essayId, {
      score: 5,
      baseRevision: 1,
    });

    expect(regrade.response.status).toBe(200);

    const after = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });
    const afterAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: essayId,
        },
      },
    });

    expect(after.totalScore).toBe(5);
    expect(after.gradedAt?.toISOString()).toBe(before.gradedAt?.toISOString());
    expect(after.gradedById).toBe(before.gradedById);
    expect(afterAnswer.score).toBe(5);
    expect(afterAnswer.gradedById).toBe(admin.id);
    expect(afterAnswer.gradedAt!.getTime()).toBeGreaterThan(
      beforeAnswer.gradedAt!.getTime(),
    );
  });
});

describe("Gate 4 — score validation and detail contract", () => {
  it("G4.1–G4.4 rejects >max, negative, non-integer, invalid payload", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const tooHigh = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 6,
      baseRevision: 0,
    });
    const negative = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: -1,
      baseRevision: 0,
    });
    const nonInteger = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essayId,
      { score: 2.5, baseRevision: 0 },
    );
    const stringScore = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essayId,
      { score: "2", baseRevision: 0 },
    );
    const missingScore = await putEssayAs(
      teacherA,
      submitted.attemptId,
      essayId,
      { baseRevision: 0 },
    );

    expect(tooHigh.response.status).toBe(400);
    expect(negative.response.status).toBe(400);
    expect(nonInteger.response.status).toBe(400);
    expect(stringScore.response.status).toBe(400);
    expect(missingScore.response.status).toBe(400);
  });

  it("G4.5 score 0 and max accepted", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1, questionIds.essay2],
      answers: [
        { questionId: questionIds.essay1, textAnswer: "Satu" },
        { questionId: questionIds.essay2, textAnswer: "Dua" },
      ],
    });
    const essay1Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );
    const essay2Id = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay2,
    );

    const zero = await putEssayAs(teacherA, submitted.attemptId, essay1Id, {
      score: 0,
      baseRevision: 1,
    });
    const max = await putEssayAs(teacherA, submitted.attemptId, essay2Id, {
      score: 4,
      baseRevision: 1,
    });

    expect(zero.response.status).toBe(200);
    expect(max.response.status).toBe(200);
    expect((max.body.attempt as ApiBody).totalScore).toBe(4);
  });

  it("G4.7 grading detail exposes explanation/key; student result stays isolated", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.single, questionIds.essay1],
      answers: [{ questionId: questionIds.single, selectedLabels: ["B"] }],
    });

    const detail = await getGradingAs(teacherA, submitted.attemptId);
    const objectives = detail.body.objectives as ApiBody[];
    const essay = (detail.body.essays as ApiBody[])[0];

    expect(detail.response.status).toBe(200);
    expect(objectives[0].correctLabels).toEqual(["B"]);
    expect(objectives[0].correctAnswers).toEqual(["4"]);
    expect(essay.explanation).toBe("Kurangi 4 lalu bagi 2.");

    const studentResult = await resultAs(studentA, submitted.attemptId);

    expect(studentResult.response.status).toBe(200);
    expect(studentResult.body.status).toBe("SUBMITTED");
    expect(studentResult.body.totalScore).toBeNull();
    expect(JSON.stringify(studentResult.body)).not.toMatch(
      /"correctAnswers"\s*:/,
    );
  });

  it("#30 SHORT_ANSWER override after GRADED keeps attempt audit immutable", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.short],
      answers: [{ questionId: questionIds.short, textAnswer: "Bandung" }],
    });
    const shortId = await examQuestionIdFor(
      submitted.examId,
      questionIds.short,
    );

    expect(submitted.submitted.body.status).toBe("GRADED");

    const beforeAttempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });
    const beforeAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: shortId,
        },
      },
    });

    expect(beforeAttempt.gradedById).toBeNull();
    expect(beforeAnswer.gradedAt).toBeNull();
    expect(beforeAnswer.gradedById).toBeNull();

    const first = await putShortAnswerAs(
      teacherA,
      submitted.attemptId,
      shortId,
      { score: 1, baseRevision: 1 },
    );

    expect(first.response.status).toBe(200);

    const firstAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: shortId,
        },
      },
    });

    expect(firstAnswer.gradedAt).toBeTruthy();
    expect(firstAnswer.gradedById).toBe(teacherA.id);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await putShortAnswerAs(
      teacherA,
      submitted.attemptId,
      shortId,
      { score: 2, baseRevision: 2 },
    );

    expect(second.response.status).toBe(200);

    const afterAttempt = await prisma.attempt.findUniqueOrThrow({
      where: { id: submitted.attemptId },
    });
    const afterAnswer = await prisma.answer.findUniqueOrThrow({
      where: {
        attemptId_examQuestionId: {
          attemptId: submitted.attemptId,
          examQuestionId: shortId,
        },
      },
    });

    expect(afterAttempt.status).toBe("GRADED");
    expect(afterAttempt.totalScore).toBe(2);
    expect(afterAttempt.gradedAt?.toISOString()).toBe(
      beforeAttempt.gradedAt?.toISOString(),
    );
    expect(afterAttempt.gradedById).toBe(beforeAttempt.gradedById);
    expect(afterAnswer.score).toBe(2);
    expect(afterAnswer.isCorrect).toBe(true);
    expect(afterAnswer.gradedById).toBe(teacherA.id);
    expect(afterAnswer.gradedAt!.getTime()).toBeGreaterThan(
      firstAnswer.gradedAt!.getTime(),
    );
  });
});

describe("Audit trail", () => {
  it("grade dan regrade tidak mengubah audit publish/close exam", async () => {
    const submitted = await createSubmittedAttempt({
      questionIds: [questionIds.essay1],
      student: studentB,
    });
    const essayId = await examQuestionIdFor(
      submitted.examId,
      questionIds.essay1,
    );

    const closed = await closeAs(teacherA, submitted.examId);

    expect(closed.response.status).toBe(200);

    const before = await prisma.exam.findUniqueOrThrow({
      where: { id: submitted.examId },
      select: {
        publishedById: true,
        closedById: true,
        publishedAt: true,
        closedAt: true,
      },
    });

    expect(before.publishedById).toBe(teacherA.id);
    expect(before.closedById).toBe(teacherA.id);

    const graded = await putEssayAs(teacherA, submitted.attemptId, essayId, {
      score: 4,
      baseRevision: 0,
    });

    expect(graded.response.status).toBe(200);

    const regraded = await putEssayAs(admin, submitted.attemptId, essayId, {
      score: 5,
      baseRevision: 1,
    });

    expect(regraded.response.status).toBe(200);

    const after = await prisma.exam.findUniqueOrThrow({
      where: { id: submitted.examId },
      select: {
        publishedById: true,
        closedById: true,
        publishedAt: true,
        closedAt: true,
      },
    });

    expect(after).toEqual(before);
  });
});

describe("Lazy sweep", () => {
  it("#29 lazy sweep finalizes at most 25 expired attempts per request", async () => {
    const exam = await createPublishedExam({
      questionIds: [questionIds.essay1],
    });
    const essayId = await examQuestionIdFor(exam.examId, questionIds.essay1);
    const suffix = randomUUID();
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const expiresAt = new Date(Date.now() - 5 * 60_000);

    for (let index = 0; index < 30; index += 1) {
      const student = await prisma.user.create({
        data: {
          name: `Siswa Sweep ${index}`,
          email: `vitest-sweep-${suffix}-${index}@example.com`,
          role: "STUDENT",
          emailVerified: true,
        },
      });

      lazyStudentIds.push(student.id);

      await prisma.attempt.create({
        data: {
          examId: exam.examId,
          studentId: student.id,
          status: "IN_PROGRESS",
          startedAt,
          expiresAt,
          maxScore: 5,
          questionOrder: [essayId],
        },
      });
    }

    const first = await listGradingAs(teacherA, `?examId=${exam.examId}`);
    const remainingAfterFirst = await prisma.attempt.count({
      where: { examId: exam.examId, status: "IN_PROGRESS" },
    });

    expect(first.response.status).toBe(200);
    expect(first.body.swept).toBe(25);
    expect(remainingAfterFirst).toBe(5);

    const second = await listGradingAs(teacherA, `?examId=${exam.examId}`);
    const remainingAfterSecond = await prisma.attempt.count({
      where: { examId: exam.examId, status: "IN_PROGRESS" },
    });

    expect(second.response.status).toBe(200);
    expect(second.body.swept).toBe(5);
    expect(remainingAfterSecond).toBe(0);
  });
});
