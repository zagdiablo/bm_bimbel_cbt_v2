import { randomUUID } from "node:crypto";
import type { QuestionType, Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ItemAnalytics } from "@/lib/analytics/types";

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
import { getExamAnalytics } from "@/lib/analytics/query";
import {
  buildExamSnapshot,
  snapshotQuestionSelect,
} from "@/lib/exams/snapshot";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

type QuestionSeed = {
  type: QuestionType;
  questionText: string;
  points?: number;
  options?: { label: string; text: string; isCorrect: boolean; order: number }[];
};

type ExamQuestionRow = {
  id: string;
  questionId: string;
  order: number;
  type: QuestionType;
};

type AnalyticsBody = {
  exam: {
    id: string;
    publishedBy: { id: string; name: string } | null;
    closedBy: { id: string; name: string } | null;
  };
  summary: {
    gradedAttempts: number;
    pendingAttempts: number;
    invalidAttempts: number;
    totalQuestions: number;
    warnings: string[];
    sample: {
      size: number;
      totalGraded: number;
      truncated: boolean;
      reliable: boolean;
    };
  };
  items: ItemAnalytics[];
};

const RUN = randomUUID().slice(0, 8);
const PREFIX = `Analytics ${RUN}`;
const BASE = new Date("2026-04-01T08:00:00.000Z");

let teacherA: TestUser;
let teacherB: TestUser;
let admin: TestUser;
let studentUser: TestUser;
let subjectId: string;

const createdUsers: string[] = [];
const createdExams: string[] = [];

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

function context(examId: string) {
  return { params: Promise.resolve({ examId }) };
}

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

async function readBody(response: Response): Promise<AnalyticsBody> {
  return (await response.json()) as AnalyticsBody;
}

async function fetchAnalytics(
  examId: string,
  query = "",
  user: TestUser | null = teacherA,
) {
  actAs(user);
  const response = await getAnalytics(
    request(`/api/reports/${examId}/analytics${query}`),
    context(examId),
  );

  return { response, body: await readBody(response) };
}

async function createUser(
  label: string,
  role: Role,
  classroom: string | null = null,
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX} ${label} ${randomUUID().slice(0, 4)}`,
      email: `analytics-${RUN}-${randomUUID()}@test.local`,
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

async function createStudents(count: number): Promise<TestUser[]> {
  const students: TestUser[] = [];

  for (let index = 0; index < count; index += 1) {
    students.push(
      await createUser(
        `Siswa ${String(index + 1).padStart(2, "0")}`,
        "STUDENT",
        "XII IPA 1",
      ),
    );
  }

  return students;
}

async function createQuestion(seed: QuestionSeed) {
  return prisma.question.create({
    data: {
      subjectId,
      ownerId: teacherA.id,
      type: seed.type,
      questionText: seed.questionText,
      points: seed.points ?? 1,
      options: { create: seed.options ?? [] },
    },
  });
}

async function createExam(
  ownerId: string,
  options: {
    title?: string;
    status?: "PUBLISHED" | "CLOSED";
    publishedAt?: Date;
    publishedById?: string | null;
    closedAt?: Date;
    closedById?: string | null;
  } = {},
) {
  const exam = await prisma.exam.create({
    data: {
      title: options.title ?? `${PREFIX} Exam ${randomUUID().slice(0, 6)}`,
      subjectId,
      ownerId,
      durationMinutes: 60,
      startAt: BASE,
      endAt: new Date(BASE.getTime() + 2 * 60 * 60 * 1000),
      token: `AN${randomUUID().replace(/-/g, "").slice(0, 8)}`.toUpperCase(),
      status: options.status ?? "PUBLISHED",
      publishedAt: options.publishedAt ?? new Date("2026-03-01T00:00:00.000Z"),
      publishedById: options.publishedById ?? null,
      closedAt: options.closedAt ?? null,
      closedById: options.closedById ?? null,
    },
  });

  createdExams.push(exam.id);

  return exam;
}

async function attachQuestions(
  examId: string,
  questionIds: string[],
): Promise<ExamQuestionRow[]> {
  const rows: ExamQuestionRow[] = [];

  for (const [index, questionId] of questionIds.entries()) {
    const question = await prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      select: snapshotQuestionSelect,
    });
    const row = await prisma.examQuestion.create({
      data: {
        examId,
        questionId,
        order: index + 1,
        snapshotJson: buildExamSnapshot(question),
      },
    });

    rows.push({
      id: row.id,
      questionId,
      order: index + 1,
      type: question.type,
    });
  }

  return rows;
}

async function createGradedAttempt(input: {
  examId: string;
  studentId: string;
  questions: ExamQuestionRow[];
  /** examQuestionId → benar/salah untuk soal objektif. */
  objectiveCorrect: Map<string, boolean>;
  essay?: { examQuestionId: string; text: string; score: number };
  totalScore: number;
  maxScore: number;
}) {
  const attempt = await prisma.attempt.create({
    data: {
      examId: input.examId,
      studentId: input.studentId,
      status: "GRADED",
      startedAt: BASE,
      expiresAt: new Date(BASE.getTime() + 60 * 60_000),
      submittedAt: new Date(BASE.getTime() + 30 * 60_000),
      receivedAt: new Date(BASE.getTime() + 30 * 60_000),
      gradedAt: new Date(BASE.getTime() + 45 * 60_000),
      gradedById: teacherA.id,
      totalScore: input.totalScore,
      maxScore: input.maxScore,
      questionOrder: input.questions.map((question) => question.id),
    },
  });

  for (const question of input.questions) {
    if (question.type === "ESSAY") {
      if (input.essay && input.essay.examQuestionId === question.id) {
        await prisma.answer.create({
          data: {
            attemptId: attempt.id,
            examQuestionId: question.id,
            textAnswer: input.essay.text,
            isCorrect: null,
            score: input.essay.score,
            gradedAt: new Date(BASE.getTime() + 45 * 60_000),
            gradedById: teacherA.id,
          },
        });
      }

      continue;
    }

    const correct = input.objectiveCorrect.get(question.id);

    if (correct === undefined) {
      continue;
    }

    await prisma.answer.create({
      data: {
        attemptId: attempt.id,
        examQuestionId: question.id,
        selectedLabels: correct ? ["A"] : ["B"],
        isCorrect: correct,
        score: correct ? 1 : 0,
        gradedAt: new Date(BASE.getTime() + 45 * 60_000),
      },
    });
  }

  return attempt;
}

beforeAll(async () => {
  teacherA = await createUser("Teacher A", "TEACHER");
  teacherB = await createUser("Teacher B", "TEACHER");
  admin = await createUser("Admin", "ADMIN");
  studentUser = await createUser("Student", "STUDENT", "XII IPA 1");

  const subject = await prisma.subject.create({
    data: {
      name: `${PREFIX} Subject`,
      code: `ANL-${RUN}`.toUpperCase(),
      ownerId: teacherA.id,
    },
  });

  subjectId = subject.id;
});

afterAll(async () => {
  await prisma.attempt.deleteMany({
    where: { examId: { in: createdExams } },
  });
  await prisma.exam.deleteMany({ where: { id: { in: createdExams } } });
  await prisma.question.deleteMany({ where: { ownerId: teacherA.id } });
  await prisma.subject.deleteMany({
    where: { code: `ANL-${RUN}`.toUpperCase() },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });

  await prisma.$disconnect();
});

describe("A1/A5 — p-value dan skip rate", () => {
  it("5 GRADED, 3 benar, 2 tidak jawab → p-value 0.6 dan skip 0.4", async () => {
    const exam = await createExam(teacherA.id);
    const questions = await attachQuestions(exam.id, [
      (
        await createQuestion({
          type: "SINGLE_CHOICE",
          questionText: "Ibu kota Indonesia?",
          options: [
            { label: "A", text: "Jakarta", isCorrect: true, order: 1 },
            { label: "B", text: "Bandung", isCorrect: false, order: 2 },
          ],
        })
      ).id,
      (
        await createQuestion({
          type: "ESSAY",
          questionText: "Jelaskan proses fotosintesis.",
          points: 5,
        })
      ).id,
    ]);
    const [essay] = questions.filter((question) => question.type === "ESSAY");
    const [single] = questions.filter(
      (question) => question.type === "SINGLE_CHOICE",
    );
    const students = await createStudents(5);

    for (const [index, student] of students.entries()) {
      const correct = index < 3;

      await createGradedAttempt({
        examId: exam.id,
        studentId: student.id,
        questions,
        objectiveCorrect: correct ? new Map([[single.id, true]]) : new Map(),
        essay: {
          examQuestionId: essay.id,
          text: "Fotosintesis mengubah cahaya menjadi energi.",
          score: correct ? 5 : 0,
        },
        totalScore: correct ? 6 : 0,
        maxScore: 6,
      });
    }

    const { response, body } = await fetchAnalytics(exam.id);
    const item = body.items.find(
      (entry) => entry.examQuestionId === single.id,
    );

    expect(response.status).toBe(200);
    expect(body.summary.gradedAttempts).toBe(5);
    expect(body.summary.warnings).toEqual(["sample_too_small"]);
    expect(item).toMatchObject({
      pValue: 0.6,
      answeredCount: 3,
      correctCount: 3,
      skipCount: 2,
      difficultyCategory: "MEDIUM",
      discrimination: null,
      discriminationCategory: null,
    });
    expect(item?.skipRate).toBeCloseTo(0.4, 10);
  });
});

describe("A2/A3 — D-index dan pengecualian esai", () => {
  it("20 GRADED, benar hanya 5 teratas → D = 1.0; esai D null", async () => {
    const exam = await createExam(teacherA.id);
    const single = await createQuestion({
      type: "SINGLE_CHOICE",
      questionText: "Hasil 3 + 4?",
      options: [
        { label: "A", text: "7", isCorrect: true, order: 1 },
        { label: "B", text: "8", isCorrect: false, order: 2 },
      ],
    });
    const essay = await createQuestion({
      type: "ESSAY",
      questionText: "Jelaskan hukum Newton.",
      points: 10,
    });
    const questions = await attachQuestions(exam.id, [single.id, essay.id]);
    const singleRow = questions.find(
      (question) => question.questionId === single.id,
    )!;
    const essayRow = questions.find(
      (question) => question.questionId === essay.id,
    )!;
    const students = await createStudents(20);

    for (const [index, student] of students.entries()) {
      const correct = index < 5;
      const essayScore = index < 5 ? 10 : index < 10 ? 0 : 0;

      await createGradedAttempt({
        examId: exam.id,
        studentId: student.id,
        questions,
        objectiveCorrect: correct ? new Map([[singleRow.id, true]]) : new Map(),
        essay: {
          examQuestionId: essayRow.id,
          text: index < 10 ? "Jawaban esai." : "",
          score: essayScore,
        },
        totalScore: (correct ? 1 : 0) + essayScore,
        maxScore: 11,
      });
    }

    const { response, body } = await fetchAnalytics(exam.id);
    const singleItem = body.items.find(
      (entry) => entry.examQuestionId === singleRow.id,
    );
    const essayItem = body.items.find(
      (entry) => entry.examQuestionId === essayRow.id,
    );

    expect(response.status).toBe(200);
    expect(singleItem).toMatchObject({
      pValue: 0.25,
      difficultyCategory: "HARD",
      discrimination: 1,
      discriminationCategory: "GOOD",
    });
    expect(singleItem?.highGroup).toEqual({ count: 5, correct: 5, rate: 1 });
    expect(singleItem?.lowGroup).toEqual({ count: 5, correct: 0, rate: 0 });

    expect(essayItem?.type).toBe("ESSAY");
    expect(essayItem?.discrimination).toBeNull();
    expect(essayItem?.discriminationCategory).toBeNull();
    expect(essayItem?.distribution.map((entry) => [entry.key, entry.count])).toEqual(
      [
        ["scored", 5],
        ["zero", 5],
        ["skipped", 10],
      ],
    );
  });
});

describe("A4 — warning sample dan exam tanpa attempt", () => {
  it("sample < 10 → sample_too_small; tanpa GRADED → no_graded_attempts", async () => {
    const small = await createExam(teacherA.id);
    const single = await createQuestion({
      type: "SINGLE_CHOICE",
      questionText: "Soal sample kecil",
      options: [
        { label: "A", text: "Benar", isCorrect: true, order: 1 },
        { label: "B", text: "Salah", isCorrect: false, order: 2 },
      ],
    });
    const smallQuestions = await attachQuestions(small.id, [single.id]);
    const students = await createStudents(5);

    for (const student of students) {
      await createGradedAttempt({
        examId: small.id,
        studentId: student.id,
        questions: smallQuestions,
        objectiveCorrect: new Map([[smallQuestions[0].id, true]]),
        totalScore: 1,
        maxScore: 1,
      });
    }

    const smallResult = await fetchAnalytics(small.id);

    expect(smallResult.response.status).toBe(200);
    expect(smallResult.body.summary.warnings).toEqual(["sample_too_small"]);
    expect(smallResult.body.items[0].discrimination).toBeNull();

    const empty = await createExam(teacherA.id);
    await attachQuestions(empty.id, [single.id]);
    const emptyResult = await fetchAnalytics(empty.id);

    expect(emptyResult.response.status).toBe(200);
    expect(emptyResult.body.summary.warnings).toEqual(["no_graded_attempts"]);
    expect(emptyResult.body.summary.gradedAttempts).toBe(0);
    expect(emptyResult.body.items[0]).toMatchObject({
      pValue: null,
      skipRate: null,
      discrimination: null,
      answeredCount: 0,
    });
  });
});

describe("A8+ — scope dan legacy audit", () => {
  it("STUDENT 403, TEACHER lain 404, ADMIN 200; legacy audit null", async () => {
    const exam = await createExam(teacherA.id, {
      publishedById: teacherA.id,
    });

    const asStudent = await fetchAnalytics(exam.id, "", studentUser);
    const asOtherTeacher = await fetchAnalytics(exam.id, "", teacherB);
    const asAdmin = await fetchAnalytics(exam.id, "", admin);

    expect(asStudent.response.status).toBe(403);
    expect(asOtherTeacher.response.status).toBe(404);
    expect(asAdmin.response.status).toBe(200);
    expect(asAdmin.body.exam.publishedBy?.id).toBe(teacherA.id);
    expect(asAdmin.body.exam.closedBy).toBeNull();

    const legacy = await createExam(teacherA.id, {
      status: "CLOSED",
      publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      publishedById: null,
      closedAt: new Date("2026-02-02T00:00:00.000Z"),
      closedById: null,
    });
    const legacyResult = await fetchAnalytics(legacy.id);

    expect(legacyResult.response.status).toBe(200);
    expect(legacyResult.body.exam.publishedBy).toBeNull();
    expect(legacyResult.body.exam.closedBy).toBeNull();
  });
});

describe("A14 — ranking D-index memakai objectiveScore", () => {
  it("skor esai tidak menggeser kelompok atas/bawah soal objektif", async () => {
    const exam = await createExam(teacherA.id);
    const objective = [];

    for (let index = 1; index <= 5; index += 1) {
      objective.push(
        await createQuestion({
          type: "SINGLE_CHOICE",
          questionText: `Objektif ${index}`,
          options: [
            { label: "A", text: "Benar", isCorrect: true, order: 1 },
            { label: "B", text: "Salah", isCorrect: false, order: 2 },
          ],
        }),
      );
    }

    const essay = await createQuestion({
      type: "ESSAY",
      questionText: "Esai pengganggu ranking",
      points: 10,
    });
    const questions = await attachQuestions(exam.id, [
      ...objective.map((question) => question.id),
      essay.id,
    ]);
    const objectiveRows = questions.filter((question) => question.type !== "ESSAY");
    const essayRow = questions.find((question) => question.type === "ESSAY")!;
    const students = await createStudents(10);

    /**
     * objectiveScore target: [5,5,4,4,3,3,2,2,1,1].
     * Q1 benar hanya untuk dua attempt teratas (A,B).
     * Essay diberi skor tinggi untuk attempt C–G sehingga ranking totalScore
     * terbalik. Jika implementasi memakai totalScore, D untuk Q1 akan 0.
     */
    const objectiveTargets = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
    const essayScores = [0, 0, 10, 10, 10, 10, 10, 0, 0, 0];

    for (const [index, student] of students.entries()) {
      const target = objectiveTargets[index];
      const correctness = new Map<string, boolean>();
      const remainingCorrect = index < 2 ? target - 1 : target;

      for (const [questionIndex, row] of objectiveRows.entries()) {
        if (questionIndex === 0) {
          correctness.set(row.id, index < 2);
          continue;
        }

        correctness.set(row.id, questionIndex <= remainingCorrect);
      }

      await createGradedAttempt({
        examId: exam.id,
        studentId: student.id,
        questions,
        objectiveCorrect: correctness,
        essay: {
          examQuestionId: essayRow.id,
          text: "Esai.",
          score: essayScores[index],
        },
        totalScore: target + essayScores[index],
        maxScore: 15,
      });
    }

    const analytics = await getExamAnalytics(exam.id);
    const firstItem = analytics.items.find(
      (item) => item.examQuestionId === objectiveRows[0].id,
    );

    expect(firstItem?.pValue).toBe(0.2);
    expect(firstItem?.discrimination).toBe(1);
    expect(firstItem?.discriminationCategory).toBe("GOOD");
    expect(firstItem?.highGroup).toEqual({ count: 2, correct: 2, rate: 1 });
    expect(firstItem?.lowGroup).toEqual({ count: 2, correct: 0, rate: 0 });
  });
});
