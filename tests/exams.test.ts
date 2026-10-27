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

import { POST as closeExam } from "@/app/api/exams/[id]/close/route";
import { POST as publishExam } from "@/app/api/exams/[id]/publish/route";
import { PUT as setExamQuestions } from "@/app/api/exams/[id]/questions/route";
import {
  DELETE as deleteExam,
  GET as getExam,
  PATCH as updateExam,
} from "@/app/api/exams/[id]/route";
import {
  GET as listExams,
  POST as createExam,
} from "@/app/api/exams/route";
import { isoToWibInput, wibInputToIso } from "@/lib/exams/datetime";
import {
  buildExamSnapshot,
  parseExamSnapshot,
  snapshotQuestionSelect,
  toExamQuestionView,
  type SnapshotQuestion,
} from "@/lib/exams/snapshot";
import {
  EXAM_TOKEN_ALPHABET,
  generateExamToken,
  isExamToken,
} from "@/lib/exams/token";
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

let teacher: TestUser;
let otherTeacher: TestUser;
let admin: TestUser;
let student: TestUser;
let subjectId: string;
let otherSubjectId: string;
let singleQuestionId: string;
let multiQuestionId: string;
let trueFalseQuestionId: string;
let essayQuestionId: string;
let invalidSingleQuestionId: string;
let otherSubjectQuestionId: string;
let snapshotSource: SnapshotQuestion;

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

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function readBody(response: Response): Promise<ApiBody> {
  return (await response.json()) as ApiBody;
}

function examPayload(overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  return {
    title: `Ujian Vitest ${randomUUID()}`,
    subjectId,
    durationMinutes: 90,
    startAt: new Date(now - 60 * 60 * 1000).toISOString(),
    endAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
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

function choiceOptions(correctLabels: string[]) {
  return ["A", "B", "C"].map((label, index) => ({
    label,
    text: `Opsi ${label}`,
    isCorrect: correctLabels.includes(label),
    order: index + 1,
  }));
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
    routeContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function publishAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await publishExam(
    new Request(`http://localhost/api/exams/${examId}/publish`, {
      method: "POST",
    }),
    routeContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function closeAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await closeExam(
    new Request(`http://localhost/api/exams/${examId}/close`, {
      method: "POST",
    }),
    routeContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function getExamAs(user: TestUser, examId: string) {
  actAs(user);
  const response = await getExam(
    new Request(`http://localhost/api/exams/${examId}`),
    routeContext(examId),
  );

  return { response, body: await readBody(response) };
}

async function publishReadyExam(
  user: TestUser,
  questionIds: string[] = [singleQuestionId],
) {
  const created = await createExamAs(user);

  expect(created.response.status).toBe(201);

  const examId = String(created.body.id);
  const set = await setQuestionsAs(
    user,
    examId,
    questionIds.map((questionId) => ({ questionId })),
  );

  expect(set.response.status).toBe(200);

  const published = await publishAs(user, examId);

  expect(published.response.status).toBe(200);

  return examId;
}

beforeAll(async () => {
  const suffix = randomUUID();

  teacher = await prisma.user.create({
    data: {
      name: "Guru Exam Vitest",
      email: `vitest-exam-teacher-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  otherTeacher = await prisma.user.create({
    data: {
      name: "Guru Exam Lain",
      email: `vitest-exam-other-${suffix}@example.com`,
      role: "TEACHER",
      emailVerified: true,
    },
  });

  admin = await prisma.user.create({
    data: {
      name: "Admin Exam Vitest",
      email: `vitest-exam-admin-${suffix}@example.com`,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  student = await prisma.user.create({
    data: {
      name: "Siswa Exam Vitest",
      email: `vitest-exam-student-${suffix}@example.com`,
      role: "STUDENT",
      classroom: "XII IPA 1",
      emailVerified: true,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      name: `Mapel Exam ${suffix.slice(0, 8)}`,
      code: `EX-${suffix.slice(0, 8)}`,
      ownerId: teacher.id,
    },
  });
  subjectId = subject.id;

  const otherSubject = await prisma.subject.create({
    data: {
      name: `Mapel Lain ${suffix.slice(0, 8)}`,
      code: `EXO-${suffix.slice(0, 8)}`,
      ownerId: teacher.id,
    },
  });
  otherSubjectId = otherSubject.id;

  singleQuestionId = (
    await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Soal single ${suffix}`,
      points: 2,
      options: choiceOptions(["B"]),
    })
  ).id;

  multiQuestionId = (
    await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "MULTIPLE_CHOICE",
      questionText: `Soal multi ${suffix}`,
      points: 3,
      options: choiceOptions(["A", "C"]),
    })
  ).id;

  trueFalseQuestionId = (
    await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "TRUE_FALSE",
      questionText: `Soal benar salah ${suffix}`,
      points: 1,
      options: [
        { label: "A", text: "Benar", isCorrect: true, order: 1 },
        { label: "B", text: "Salah", isCorrect: false, order: 2 },
      ],
    })
  ).id;

  essayQuestionId = (
    await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "ESSAY",
      questionText: `Soal esai ${suffix}`,
      points: 5,
    })
  ).id;

  invalidSingleQuestionId = (
    await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Soal single rusak ${suffix}`,
      options: choiceOptions(["A", "B"]),
    })
  ).id;

  otherSubjectQuestionId = (
    await createQuestion({
      subjectId: otherSubjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Soal mapel lain ${suffix}`,
      options: choiceOptions(["A"]),
    })
  ).id;

  snapshotSource = await prisma.question.findUniqueOrThrow({
    where: { id: singleQuestionId },
    select: snapshotQuestionSelect,
  });
});

afterAll(async () => {
  const userIds = [teacher.id, otherTeacher.id, admin.id, student.id];

  await prisma.exam.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.question.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.subject.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("POST /api/exams", () => {
  it("TEACHER membuat exam valid → 201 DRAFT, owner benar, token null", async () => {
    const { response, body } = await createExamAs(teacher);

    expect(response.status).toBe(201);
    expect(body.status).toBe("DRAFT");
    expect(body.ownerId).toBe(teacher.id);
    expect(body.token).toBeNull();
    expect(body.questionCount).toBe(0);
    expect(body.questions).toEqual([]);
  });

  it("durasi 0 dan 481 ditolak → 400", async () => {
    const zero = await createExamAs(teacher, { durationMinutes: 0 });
    const tooLong = await createExamAs(teacher, { durationMinutes: 481 });

    expect(zero.response.status).toBe(400);
    expect(tooLong.response.status).toBe(400);
  });

  it("endAt <= startAt ditolak → 400", async () => {
    const now = Date.now();
    const { response } = await createExamAs(teacher, {
      startAt: new Date(now + 60_000).toISOString(),
      endAt: new Date(now).toISOString(),
    });

    expect(response.status).toBe(400);
  });

  it("subject yang tidak ada ditolak → 400", async () => {
    const { response } = await createExamAs(teacher, {
      subjectId: "subject-tidak-ada",
    });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/exams/[id]", () => {
  it("PATCH draft mengubah field → 200", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    actAs(teacher);
    const response = await updateExam(
      jsonRequest(`/api/exams/${examId}`, "PATCH", {
        ...examPayload(),
        title: "Judul Ujian Diperbarui",
      }),
      routeContext(examId),
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(body.title).toBe("Judul Ujian Diperbarui");
  });

  it("PATCH exam PUBLISHED ditolak → 400", async () => {
    const examId = await publishReadyExam(teacher);
    const payload = examPayload({ title: "Tidak boleh berubah" });

    actAs(teacher);
    const response = await updateExam(
      jsonRequest(`/api/exams/${examId}`, "PATCH", payload),
      routeContext(examId),
    );

    expect(response.status).toBe(400);
  });

  it("ganti subject saat sudah ada soal ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
    ]);

    actAs(teacher);
    const response = await updateExam(
      jsonRequest(`/api/exams/${examId}`, "PATCH", {
        ...examPayload(),
        subjectId: otherSubjectId,
      }),
      routeContext(examId),
    );

    expect(response.status).toBe(400);
  });
});

describe("PUT /api/exams/[id]/questions", () => {
  it("menyimpan urutan dan pointsOverride → 200", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    const { response, body } = await setQuestionsAs(teacher, examId, [
      { questionId: multiQuestionId },
      { questionId: singleQuestionId, pointsOverride: 7 },
      { questionId: trueFalseQuestionId },
      { questionId: essayQuestionId },
    ]);

    expect(response.status).toBe(200);

    const questions = body.questions as {
      id: string;
      order: number;
      points: number;
      pointsOverride: number | null;
    }[];

    expect(questions.map((question) => question.order)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(questions[1]?.pointsOverride).toBe(7);
    expect(questions[1]?.points).toBe(7);
  });

  it("questionId duplikat ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    const { response } = await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
      { questionId: singleQuestionId },
    ]);

    expect(response.status).toBe(400);
  });

  it("soal soft-deleted ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);
    const question = await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Soal akan dihapus ${randomUUID()}`,
      options: choiceOptions(["A"]),
    });

    await prisma.question.update({
      where: { id: question.id },
      data: { deletedAt: new Date() },
    });

    const { response } = await setQuestionsAs(teacher, examId, [
      { questionId: question.id },
    ]);

    expect(response.status).toBe(400);
  });

  it("soal dari mapel lain ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    const { response, body } = await setQuestionsAs(teacher, examId, [
      { questionId: otherSubjectQuestionId },
    ]);

    expect(response.status).toBe(400);
    expect(body.invalidQuestionIds).toEqual([otherSubjectQuestionId]);
  });

  it("lebih dari 200 soal ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);
    const questions = Array.from({ length: 201 }, () => ({
      questionId: `q-${randomUUID()}`,
    }));

    const { response } = await setQuestionsAs(teacher, examId, questions);

    expect(response.status).toBe(400);
  });
});

describe("POST /api/exams/[id]/publish", () => {
  it("publish tanpa soal ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const { response } = await publishAs(teacher, String(created.body.id));

    expect(response.status).toBe(400);
  });

  it("publish tanpa jadwal ditolak → 400", async () => {
    const created = await createExamAs(teacher, {
      startAt: null,
      endAt: null,
    });
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
    ]);

    const { response } = await publishAs(teacher, examId);

    expect(response.status).toBe(400);
  });

  it("publish dengan soal soft-deleted ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);
    const question = await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Soal publish terhapus ${randomUUID()}`,
      options: choiceOptions(["A"]),
    });

    await setQuestionsAs(teacher, examId, [{ questionId: question.id }]);
    await prisma.question.update({
      where: { id: question.id },
      data: { deletedAt: new Date() },
    });

    const { response, body } = await publishAs(teacher, examId);

    expect(response.status).toBe(400);
    expect(body.invalidQuestions).toBeTruthy();
  });

  it("publish dengan kunci jawaban invalid ditolak → 400", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: invalidSingleQuestionId },
    ]);

    const { response, body } = await publishAs(teacher, examId);

    expect(response.status).toBe(400);
    expect(body.invalidQuestions).toBeTruthy();
  });

  it("publish valid → PUBLISHED, token, publishedAt, snapshot terisi", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
      { questionId: multiQuestionId },
    ]);

    const { response, body } = await publishAs(teacher, examId);

    expect(response.status).toBe(200);
    expect(body.status).toBe("PUBLISHED");
    expect(body.publishedAt).toBeTruthy();
    expect(String(body.token)).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const questions = body.questions as {
      source: string;
      snapshot: { version: number } | null;
    }[];

    expect(questions).toHaveLength(2);
    expect(questions.every((question) => question.source === "snapshot")).toBe(
      true,
    );
    expect(questions.every((question) => question.snapshot?.version === 1)).toBe(
      true,
    );

    const rows = await prisma.examQuestion.findMany({
      where: { examId },
      select: { snapshotJson: true },
    });

    expect(rows.every((row) => row.snapshotJson !== null)).toBe(true);
  });

  it("publish mencatat publishedById sebagai audit aktor", async () => {
    const examId = await publishReadyExam(teacher);

    const row = await prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      select: { publishedById: true, publishedAt: true, closedById: true },
    });
    const detail = await getExamAs(teacher, examId);
    const publishedBy = detail.body.publishedBy as { id: string; name: string };

    expect(row.publishedById).toBe(teacher.id);
    expect(row.publishedAt).toBeTruthy();
    expect(row.closedById).toBeNull();
    expect(publishedBy.id).toBe(teacher.id);
    expect(publishedBy.name).toBe(teacher.name);
    expect(detail.body.closedBy).toBeNull();
  });

  it("publish ulang ditolak → 400", async () => {
    const examId = await publishReadyExam(teacher);
    const { response } = await publishAs(teacher, examId);

    expect(response.status).toBe(400);
  });
});

describe("Immutability published exam", () => {
  it("edit soal bank setelah publish → GET memakai snapshot lama", async () => {
    const question = await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "SINGLE_CHOICE",
      questionText: `Teks awal ${randomUUID()}`,
      points: 2,
      options: [
        { label: "A", text: "Opsi awal A", isCorrect: false, order: 1 },
        { label: "B", text: "Opsi awal B", isCorrect: true, order: 2 },
      ],
    });

    const examId = await publishReadyExam(teacher, [question.id]);
    const before = await getExamAs(teacher, examId);
    const beforeSnapshot = before.body.questions as {
      snapshot: { questionText: string; options: { text: string }[] };
    }[];
    const oldText = beforeSnapshot[0]?.snapshot.questionText;

    await prisma.question.update({
      where: { id: question.id },
      data: { questionText: "Teks baru setelah publish", points: 99 },
    });
    await prisma.questionOption.updateMany({
      where: { questionId: question.id },
      data: { text: "Opsi baru setelah publish" },
    });

    const after = await getExamAs(teacher, examId);
    const afterSnapshot = after.body.questions as {
      snapshot: {
        questionText: string;
        points: number;
        options: { text: string }[];
      };
    }[];

    expect(after.response.status).toBe(200);
    expect(afterSnapshot[0]?.snapshot.questionText).toBe(oldText);
    expect(afterSnapshot[0]?.snapshot.points).toBe(2);
    expect(afterSnapshot[0]?.snapshot.options[0]?.text).toBe("Opsi awal A");
    expect(afterSnapshot[0]?.snapshot.options[1]?.text).toBe("Opsi awal B");
  });

  it("hard-delete soal setelah publish → snapshot tetap utuh dan questionId null", async () => {
    const question = await createQuestion({
      subjectId,
      ownerId: teacher.id,
      type: "ESSAY",
      questionText: `Esai snapshot ${randomUUID()}`,
      points: 5,
    });

    const examId = await publishReadyExam(teacher, [question.id]);

    await prisma.question.delete({ where: { id: question.id } });

    const { response, body } = await getExamAs(teacher, examId);
    const questions = body.questions as {
      snapshot: { questionText: string } | null;
    }[];
    const row = await prisma.examQuestion.findFirstOrThrow({
      where: { examId },
      select: { questionId: true, snapshotJson: true },
    });

    expect(response.status).toBe(200);
    expect(row.questionId).toBeNull();
    expect(row.snapshotJson).not.toBeNull();
    expect(questions[0]?.snapshot?.questionText).toContain("Esai snapshot");
  });
});

describe("Close and delete", () => {
  it("close draft ditolak, close published → CLOSED, close ulang ditolak", async () => {
    const draft = await createExamAs(teacher);
    const draftClose = await closeAs(teacher, String(draft.body.id));

    expect(draftClose.response.status).toBe(400);

    const examId = await publishReadyExam(teacher);
    const first = await closeAs(teacher, examId);

    expect(first.response.status).toBe(200);
    expect(first.body.status).toBe("CLOSED");
    expect(first.body.closedAt).toBeTruthy();

    const second = await closeAs(teacher, examId);

    expect(second.response.status).toBe(400);
  });

  it("close mencatat closedById sebagai audit aktor", async () => {
    const examId = await publishReadyExam(teacher);
    const { response, body } = await closeAs(teacher, examId);

    expect(response.status).toBe(200);
    expect(body.status).toBe("CLOSED");

    const row = await prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      select: {
        closedById: true,
        closedAt: true,
        publishedById: true,
      },
    });
    const closedBy = body.closedBy as { id: string; name: string };

    expect(row.closedById).toBe(teacher.id);
    expect(row.closedAt).toBeTruthy();
    expect(row.publishedById).toBe(teacher.id);
    expect(closedBy.id).toBe(teacher.id);
    expect(closedBy.name).toBe(teacher.name);
  });

  it("DELETE draft → 200 dan exam question cascade", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
    ]);

    actAs(teacher);
    const response = await deleteExam(
      new Request(`http://localhost/api/exams/${examId}`, {
        method: "DELETE",
      }),
      routeContext(examId),
    );
    const remaining = await prisma.examQuestion.count({ where: { examId } });

    expect(response.status).toBe(200);
    expect(remaining).toBe(0);
  });

  it("DELETE published/closed ditolak → 400", async () => {
    const examId = await publishReadyExam(teacher);

    actAs(teacher);
    const publishedResponse = await deleteExam(
      new Request(`http://localhost/api/exams/${examId}`, {
        method: "DELETE",
      }),
      routeContext(examId),
    );

    expect(publishedResponse.status).toBe(400);

    await closeAs(teacher, examId);
    actAs(teacher);
    const closedResponse = await deleteExam(
      new Request(`http://localhost/api/exams/${examId}`, {
        method: "DELETE",
      }),
      routeContext(examId),
    );

    expect(closedResponse.status).toBe(400);
  });
});

describe("Scope and list", () => {
  it("STUDENT GET /api/exams → 403", async () => {
    actAs(student);
    const response = await listExams(
      new Request("http://localhost/api/exams"),
    );

    expect(response.status).toBe(403);
  });

  it("TEACHER tidak bisa mengakses exam guru lain → 404", async () => {
    const created = await createExamAs(otherTeacher);
    const examId = String(created.body.id);

    const read = await getExamAs(teacher, examId);

    expect(read.response.status).toBe(404);

    actAs(teacher);
    const patched = await updateExam(
      jsonRequest(`/api/exams/${examId}`, "PATCH", examPayload()),
      routeContext(examId),
    );
    const deleted = await deleteExam(
      new Request(`http://localhost/api/exams/${examId}`, {
        method: "DELETE",
      }),
      routeContext(examId),
    );

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
  });

  it("ADMIN bisa melihat dan mengubah exam guru → 200", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    const read = await getExamAs(admin, examId);

    expect(read.response.status).toBe(200);

    actAs(admin);
    const patched = await updateExam(
      jsonRequest(`/api/exams/${examId}`, "PATCH", {
        ...examPayload(),
        title: "Diubah oleh admin",
      }),
      routeContext(examId),
    );

    expect(patched.status).toBe(200);
  });

  it("list memfilter search/status/subject dan menghormati scope", async () => {
    const marker = `list-${randomUUID()}`;
    const own = await createExamAs(teacher, {
      title: `${marker} milik guru`,
    });
    await createExamAs(otherTeacher, { title: `${marker} milik lain` });

    actAs(teacher);
    const teacherList = await listExams(
      new Request(
        `http://localhost/api/exams?search=${encodeURIComponent(marker)}`,
      ),
    );
    const teacherBody = await readBody(teacherList);

    expect(teacherList.status).toBe(200);
    expect(teacherBody.total).toBe(1);
    expect((teacherBody.items as { id: string }[])[0]?.id).toBe(own.body.id);

    actAs(admin);
    const adminList = await listExams(
      new Request(
        `http://localhost/api/exams?search=${encodeURIComponent(marker)}`,
      ),
    );
    const adminBody = await readBody(adminList);

    expect(adminBody.total).toBe(2);

    actAs(teacher);
    const statusList = await listExams(
      new Request(
        `http://localhost/api/exams?search=${encodeURIComponent(marker)}&status=DRAFT`,
      ),
    );
    const statusBody = await readBody(statusList);

    expect(statusBody.total).toBe(1);

    const subjectList = await listExams(
      new Request(
        `http://localhost/api/exams?search=${encodeURIComponent(marker)}&subjectId=${otherSubjectId}`,
      ),
    );
    const subjectBody = await readBody(subjectList);

    expect(subjectBody.total).toBe(0);
  });

  it("totalPoints memakai pointsOverride", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId, pointsOverride: 5 },
      { questionId: multiQuestionId },
    ]);

    const { body } = await getExamAs(teacher, examId);

    expect(body.totalPoints).toBe(8);
  });

  it("detail draft memakai soal live dan published memakai snapshot", async () => {
    const created = await createExamAs(teacher);
    const examId = String(created.body.id);

    await setQuestionsAs(teacher, examId, [
      { questionId: singleQuestionId },
    ]);

    const draft = await getExamAs(teacher, examId);
    const draftQuestions = draft.body.questions as {
      source: string;
      sourceAvailable: boolean;
    }[];

    expect(draftQuestions[0]?.source).toBe("live");
    expect(draftQuestions[0]?.sourceAvailable).toBe(true);
  });
});

describe("Snapshot view and parser", () => {
  it("toExamQuestionView(forStudent: false) menyertakan isCorrect dan explanation", () => {
    const view = toExamQuestionView(
      {
        id: "eq-teacher",
        order: 1,
        pointsOverride: null,
        snapshotJson: null,
        examStatus: "DRAFT",
        question: snapshotSource,
      },
      { forStudent: false },
    );

    expect(view.snapshot?.explanation).toBe("Pembahasan uji.");
    expect(
      view.snapshot?.options.some((option) => option.isCorrect === true),
    ).toBe(true);
  });

  it("toExamQuestionView(forStudent: true) membuang isCorrect dan explanation", () => {
    const view = toExamQuestionView(
      {
        id: "eq-student",
        order: 1,
        pointsOverride: null,
        snapshotJson: null,
        examStatus: "DRAFT",
        question: snapshotSource,
      },
      { forStudent: true },
    );

    expect(view.snapshot).not.toHaveProperty("explanation");
    expect(
      view.snapshot?.options.every(
        (option) => !Object.hasOwn(option, "isCorrect"),
      ),
    ).toBe(true);
    expect(view.snapshot?.options.every((option) => option.text.length > 0)).toBe(
      true,
    );
  });

  it("parseExamSnapshot mengabaikan unknown fields (forward-compatible)", () => {
    const snapshot = buildExamSnapshot(snapshotSource);
    const parsed = parseExamSnapshot({
      ...snapshot,
      extraField: "future-data",
      futureNested: { a: 1 },
    });

    expect(parsed.version).toBe(1);
    expect(parsed.questionText).toBe(snapshot.questionText);
    expect(parsed).not.toHaveProperty("extraField");
    expect(parsed).not.toHaveProperty("futureNested");
  });
});

describe("Datetime WIB", () => {
  it("mengonversi datetime-local WIB ke ISO UTC dan sebaliknya", () => {
    const iso = wibInputToIso("2026-11-01T08:30");

    expect(iso).toBe("2026-11-01T01:30:00.000Z");
    expect(isoToWibInput(iso)).toBe("2026-11-01T08:30");
  });
});

describe("Token generator", () => {
  it("menghasilkan 1000 token unik dengan alphabet yang aman dibaca", () => {
    const tokens = new Set<string>();

    for (let index = 0; index < 1_000; index += 1) {
      const token = generateExamToken();

      expect(token).toHaveLength(6);
      expect(isExamToken(token)).toBe(true);
      expect(
        [...token].every((character) =>
          EXAM_TOKEN_ALPHABET.includes(character),
        ),
      ).toBe(true);
      tokens.add(token);
    }

    expect(tokens.size).toBe(1_000);
  });
});
