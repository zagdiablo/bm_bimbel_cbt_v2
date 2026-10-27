import { randomUUID } from "node:crypto";
import type {
  AttemptStatus,
  ExamStatus,
  Role,
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

import { GET as exportReport } from "@/app/api/reports/[examId]/export/route";
import { GET as getReport } from "@/app/api/reports/[examId]/route";
import { GET as listReports } from "@/app/api/reports/route";
import { fileResponse } from "@/lib/exporters/shared";
import { LATE_SUBMISSION_THRESHOLD_MS } from "@/lib/grading/constants";
import { isLateSubmission } from "@/lib/grading/late";
import { prisma } from "@/lib/prisma";

type TestUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classroom: string | null;
};

type ReportAttemptItem = {
  id: string;
  student: { id: string; name: string; classroom: string | null };
  status: AttemptStatus;
  totalScore: number | null;
  maxScore: number;
  percentage: number | null;
  isLate: boolean;
};

type ReportDetailBody = {
  exam: {
    id: string;
    title: string;
    token: string | null;
    status: ExamStatus;
  };
  stats: {
    totalAttempts: number;
    byStatus: { inProgress: number; submitted: number; graded: number };
    graded: {
      count: number;
      avgScore: number | null;
      minScore: number | null;
      maxScore: number | null;
      avgPercentage: number | null;
    };
    histogram: { bin: number; label: string; count: number }[];
    histogramTotal: number;
    invalidScores: number;
  };
  classrooms: (string | null)[];
  attempts: {
    items: ReportAttemptItem[];
    total: number;
    page: number;
    pageSize: number;
  };
};

type ReportListBody = {
  items: {
    id: string;
    title: string;
    counts: {
      total: number;
      inProgress: number;
      submitted: number;
      graded: number;
    };
    avgScore: number | null;
    maxScore: number | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
};

const RUN = randomUUID().slice(0, 8);
const PREFIX = `Report ${RUN}`;
const BASE = new Date("2026-03-01T00:00:00.000Z");

let teacherA: TestUser;
let teacherB: TestUser;
let admin: TestUser;
let studentUser: TestUser;
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

function request(path: string): Request {
  return new Request(`http://localhost${path}`);
}

function detailContext(examId: string) {
  return { params: Promise.resolve({ examId }) };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createUser(
  label: string,
  role: Role,
  classroom: string | null = null,
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX} ${label} ${randomUUID().slice(0, 4)}`,
      email: `report-${RUN}-${randomUUID()}@test.local`,
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

async function createExam(
  ownerId: string,
  overrides: { title?: string; startAt?: Date | null } = {},
) {
  const exam = await prisma.exam.create({
    data: {
      title: overrides.title ?? `${PREFIX} Exam ${randomUUID().slice(0, 6)}`,
      subjectId,
      ownerId,
      durationMinutes: 60,
      startAt:
        overrides.startAt === undefined ? BASE : overrides.startAt,
      endAt: new Date(BASE.getTime() + 2 * 60 * 60 * 1000),
      token: `RT${randomUUID().replace(/-/g, "").slice(0, 8)}`.toUpperCase(),
      status: "PUBLISHED",
      publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    },
  });

  createdExams.push(exam.id);

  return exam;
}

type AttemptOverrides = {
  status?: AttemptStatus;
  totalScore?: number | null;
  maxScore?: number;
  startedAt?: Date;
  submittedAt?: Date | null;
  receivedAt?: Date | null;
  gradedAt?: Date | null;
  gradedById?: string | null;
};

async function createAttempt(
  examId: string,
  studentId: string,
  overrides: AttemptOverrides = {},
) {
  const status = overrides.status ?? "GRADED";
  const startedAt = overrides.startedAt ?? BASE;
  const submittedAt =
    overrides.submittedAt === undefined
      ? status === "IN_PROGRESS"
        ? null
        : new Date(startedAt.getTime() + 30 * 60_000)
      : overrides.submittedAt;
  const receivedAt =
    overrides.receivedAt === undefined ? submittedAt : overrides.receivedAt;

  const attempt = await prisma.attempt.create({
    data: {
      examId,
      studentId,
      status,
      startedAt,
      expiresAt: new Date(startedAt.getTime() + 60 * 60_000),
      submittedAt,
      receivedAt,
      gradedAt:
        overrides.gradedAt === undefined
          ? status === "GRADED"
            ? new Date(startedAt.getTime() + 45 * 60_000)
            : null
          : overrides.gradedAt,
      gradedById:
        overrides.gradedById === undefined
          ? status === "GRADED"
            ? teacherA.id
            : null
          : overrides.gradedById,
      totalScore:
        overrides.totalScore === undefined
          ? status === "GRADED"
            ? 50
            : null
          : overrides.totalScore,
      maxScore: overrides.maxScore ?? 100,
      questionOrder: [],
    },
  });

  createdAttempts.push(attempt.id);

  return attempt;
}

async function createStudents(
  count: number,
  classroom: string | null,
  label = "Siswa",
): Promise<TestUser[]> {
  const students: TestUser[] = [];

  for (let index = 0; index < count; index += 1) {
    students.push(
      await createUser(`${label} ${String(index + 1).padStart(2, "0")}`, "STUDENT", classroom),
    );
  }

  return students;
}

async function fetchDetail(
  examId: string,
  query = "",
  user: TestUser | null = teacherA,
) {
  actAs(user);
  const response = await getReport(
    request(`/api/reports/${examId}${query}`),
    detailContext(examId),
  );

  return { response, body: await readJson<ReportDetailBody>(response) };
}

function histogramCounts(body: ReportDetailBody): number[] {
  return body.stats.histogram.map((bin) => bin.count);
}

beforeAll(async () => {
  teacherA = await createUser("Teacher A", "TEACHER");
  teacherB = await createUser("Teacher B", "TEACHER");
  admin = await createUser("Admin", "ADMIN");
  studentUser = await createUser("Student", "STUDENT", "XII IPA 1");

  const subject = await prisma.subject.create({
    data: {
      name: `${PREFIX} Subject`,
      code: `RPT-${RUN}`.toUpperCase(),
      ownerId: teacherA.id,
    },
  });

  subjectId = subject.id;
});

afterAll(async () => {
  await prisma.attempt.deleteMany({ where: { id: { in: createdAttempts } } });
  await prisma.exam.deleteMany({ where: { id: { in: createdExams } } });
  await prisma.subject.deleteMany({
    where: { code: `RPT-${RUN}`.toUpperCase() },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
});

describe("Gate 1 — aggregation correctness", () => {
  it("R1 5 GRADED + 2 SUBMITTED + 1 IN_PROGRESS → avg/min/max dari GRADED saja", async () => {
    const exam = await createExam(teacherA.id);
    const students = await createStudents(8, "XII IPA 1");
    const scores = [80, 60, 40, 20, 0];

    for (const [index, score] of scores.entries()) {
      await createAttempt(exam.id, students[index].id, {
        status: "GRADED",
        totalScore: score,
        maxScore: 100,
      });
    }

    await createAttempt(exam.id, students[5].id, {
      status: "SUBMITTED",
      totalScore: 30,
    });
    await createAttempt(exam.id, students[6].id, {
      status: "SUBMITTED",
      totalScore: null,
    });
    await createAttempt(exam.id, students[7].id, {
      status: "IN_PROGRESS",
      totalScore: null,
      submittedAt: null,
      receivedAt: null,
      gradedAt: null,
      gradedById: null,
    });

    const { response, body } = await fetchDetail(exam.id);

    expect(response.status).toBe(200);
    expect(body.stats.totalAttempts).toBe(8);
    expect(body.stats.byStatus).toEqual({
      inProgress: 1,
      submitted: 2,
      graded: 5,
    });
    expect(body.stats.graded.count).toBe(5);
    expect(body.stats.graded.avgScore).toBe(40);
    expect(body.stats.graded.minScore).toBe(0);
    expect(body.stats.graded.maxScore).toBe(80);
    expect(body.stats.graded.avgPercentage).toBe(40);
    expect(body.stats.histogramTotal).toBe(5);
    expect(body.attempts.total).toBe(8);
  });

  it("R2 histogram 0%/50%/100% → [1,0,1,0,1] dan sum = GRADED count", async () => {
    const exam = await createExam(teacherA.id);
    const students = await createStudents(3, "XII IPA 1");

    for (const [index, score] of [0, 50, 100].entries()) {
      await createAttempt(exam.id, students[index].id, {
        status: "GRADED",
        totalScore: score,
        maxScore: 100,
      });
    }

    const { response, body } = await fetchDetail(exam.id);

    expect(response.status).toBe(200);
    expect(histogramCounts(body)).toEqual([1, 0, 1, 0, 1]);
    expect(body.stats.histogramTotal).toBe(3);
    expect(body.stats.histogramTotal).toBe(body.stats.graded.count);
    expect(body.stats.invalidScores).toBe(0);
  });

  it("R3 batas bin inklusif: 20/40/60/80/100 → [1,1,1,1,1]", async () => {
    const exam = await createExam(teacherA.id);
    const students = await createStudents(5, "XII IPA 1");

    for (const [index, score] of [20, 40, 60, 80, 100].entries()) {
      await createAttempt(exam.id, students[index].id, {
        status: "GRADED",
        totalScore: score,
        maxScore: 100,
      });
    }

    const { body } = await fetchDetail(exam.id);

    expect(histogramCounts(body)).toEqual([1, 1, 1, 1, 1]);
    expect(body.stats.histogramTotal).toBe(5);
  });

  it("R4 satu GRADED → avg = min = max = totalScore", async () => {
    const exam = await createExam(teacherA.id);
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 70,
      maxScore: 100,
    });

    const { body } = await fetchDetail(exam.id);

    expect(body.stats.graded).toEqual({
      count: 1,
      avgScore: 70,
      minScore: 70,
      maxScore: 70,
      avgPercentage: 70,
    });
  });

  it("R5 exam tanpa attempt → 200, counter 0, bukan 404", async () => {
    const exam = await createExam(teacherA.id);
    const { response, body } = await fetchDetail(exam.id);

    expect(response.status).toBe(200);
    expect(body.stats.totalAttempts).toBe(0);
    expect(body.stats.byStatus).toEqual({
      inProgress: 0,
      submitted: 0,
      graded: 0,
    });
    expect(body.stats.graded).toEqual({
      count: 0,
      avgScore: null,
      minScore: null,
      maxScore: null,
      avgPercentage: null,
    });
    expect(histogramCounts(body)).toEqual([0, 0, 0, 0, 0]);
    expect(body.stats.invalidScores).toBe(0);
    expect(body.attempts.items).toEqual([]);
    expect(body.attempts.total).toBe(0);
  });

  it("R6 list hanya exam yang punya attempt + counter per status", async () => {
    const marker = `List ${randomUUID().slice(0, 6)}`;
    const withAttempts = await createExam(teacherA.id, {
      title: `${PREFIX} ${marker} With Attempts`,
    });
    const withoutAttempts = await createExam(teacherA.id, {
      title: `${PREFIX} ${marker} Empty`,
    });
    const students = await createStudents(7, "XII IPA 1");

    for (const [index, score] of [100, 80, 60, 40, 20].entries()) {
      await createAttempt(withAttempts.id, students[index].id, {
        status: "GRADED",
        totalScore: score,
        maxScore: 100,
      });
    }

    await createAttempt(withAttempts.id, students[5].id, {
      status: "SUBMITTED",
      totalScore: 10,
    });
    await createAttempt(withAttempts.id, students[6].id, {
      status: "IN_PROGRESS",
      totalScore: null,
      submittedAt: null,
      receivedAt: null,
    });

    actAs(teacherA);
    const response = await listReports(
      request(`/api/reports?search=${encodeURIComponent(marker)}`),
    );
    const body = await readJson<ReportListBody>(response);

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items.map((item) => item.id)).toEqual([withAttempts.id]);

    const item = body.items[0];

    expect(item.counts).toEqual({
      total: 7,
      inProgress: 1,
      submitted: 1,
      graded: 5,
    });
    expect(item.avgScore).toBe(60);
    expect(item.maxScore).toBe(100);
    expect(withoutAttempts.id).not.toBe(item.id);
  });
});

describe("Gate 2 — scope enforcement", () => {
  it("R7 TEACHER B akses detail exam TEACHER A → 404", async () => {
    const exam = await createExam(teacherA.id);

    const { response } = await fetchDetail(exam.id, "", teacherB);

    expect(response.status).toBe(404);
  });

  it("R8 TEACHER B akses export exam TEACHER A → 404", async () => {
    const exam = await createExam(teacherA.id);

    actAs(teacherB);
    const response = await exportReport(
      request(`/api/reports/${exam.id}/export?format=xlsx`),
      detailContext(exam.id),
    );

    expect(response.status).toBe(404);
  });

  it("R9 ADMIN akses detail dan export exam milik teacher → 200", async () => {
    const exam = await createExam(teacherA.id);
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 90,
    });

    const { response } = await fetchDetail(exam.id, "", admin);
    expect(response.status).toBe(200);

    actAs(admin);
    const exported = await exportReport(
      request(`/api/reports/${exam.id}/export?format=xlsx`),
      detailContext(exam.id),
    );

    expect(exported.status).toBe(200);
  });

  it("R10 STUDENT → 403 untuk list, detail, dan export", async () => {
    const exam = await createExam(teacherA.id);

    actAs(studentUser);

    const list = await listReports(request("/api/reports"));
    const detail = await getReport(
      request(`/api/reports/${exam.id}`),
      detailContext(exam.id),
    );
    const exported = await exportReport(
      request(`/api/reports/${exam.id}/export?format=xlsx`),
      detailContext(exam.id),
    );

    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(exported.status).toBe(403);
  });

  it("R11 tanpa session → 401", async () => {
    const exam = await createExam(teacherA.id);

    actAs(null);

    const list = await listReports(request("/api/reports"));
    const detail = await getReport(
      request(`/api/reports/${exam.id}`),
      detailContext(exam.id),
    );

    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
  });

  it("R12 list TEACHER hanya exam miliknya; ADMIN melihat semua", async () => {
    const marker = `Scope ${randomUUID().slice(0, 6)}`;
    const examA = await createExam(teacherA.id, {
      title: `${PREFIX} ${marker} A`,
    });
    const examB = await createExam(teacherB.id, {
      title: `${PREFIX} ${marker} B`,
    });
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(examA.id, student.id, { status: "GRADED", totalScore: 80 });
    await createAttempt(examB.id, student.id, { status: "GRADED", totalScore: 60 });

    const asTeacherA = await (async () => {
      actAs(teacherA);
      return readJson<ReportListBody>(
        await listReports(
          request(`/api/reports?search=${encodeURIComponent(marker)}`),
        ),
      );
    })();

    const asTeacherB = await (async () => {
      actAs(teacherB);
      return readJson<ReportListBody>(
        await listReports(
          request(`/api/reports?search=${encodeURIComponent(marker)}`),
        ),
      );
    })();

    const asAdmin = await (async () => {
      actAs(admin);
      return readJson<ReportListBody>(
        await listReports(
          request(`/api/reports?search=${encodeURIComponent(marker)}`),
        ),
      );
    })();

    expect(asTeacherA.items.map((item) => item.id)).toEqual([examA.id]);
    expect(asTeacherB.items.map((item) => item.id)).toEqual([examB.id]);
    expect(asAdmin.total).toBe(2);
  });
});

describe("Gate 4 — no sensitive leak", () => {
  it("R13 payload detail tidak memuat kunci jawaban, pembahasan, snapshot, atau order", async () => {
    const exam = await createExam(teacherA.id);
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(exam.id, student.id, {
      status: "GRADED",
      totalScore: 80,
    });

    const { response, body } = await fetchDetail(exam.id);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("explanation");
    expect(serialized).not.toContain("snapshotJson");
    expect(serialized).not.toContain("questionOrder");
    expect(serialized).not.toContain("optionOrder");
    expect(serialized).not.toContain('"answers"');
  });

  it("R14 token hanya ada di detail, tidak di list", async () => {
    const marker = `Token ${randomUUID().slice(0, 6)}`;
    const exam = await createExam(teacherA.id, {
      title: `${PREFIX} ${marker}`,
    });
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(exam.id, student.id, { status: "GRADED", totalScore: 50 });

    const detail = await fetchDetail(exam.id);
    expect(detail.body.exam.token).toBe(exam.token);

    actAs(teacherA);
    const list = await readJson<ReportListBody>(
      await listReports(
        request(`/api/reports?search=${encodeURIComponent(marker)}`),
      ),
    );

    expect(list.items[0]).not.toHaveProperty("token");
    expect(JSON.stringify(list.items[0])).not.toContain(String(exam.token));
  });

  it("R15 payload tidak memuat data jawaban per soal", async () => {
    const exam = await createExam(teacherA.id);
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(exam.id, student.id, { status: "GRADED", totalScore: 70 });

    const { body } = await fetchDetail(exam.id);
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("questionId");
    expect(serialized).not.toContain("selectedLabels");
    expect(serialized).not.toContain("textAnswer");
    expect(serialized).not.toContain("examQuestionId");
  });
});

describe("Gate 5 — filters and late badge", () => {
  it("R16 filter classroom hanya mengembalikan siswa kelas tersebut", async () => {
    const exam = await createExam(teacherA.id);
    const ipa = await createStudents(2, "XII IPA 1", "Ipa");
    const ips = await createStudents(1, "XII IPS 2", "Ips");

    for (const student of [...ipa, ...ips]) {
      await createAttempt(exam.id, student.id, {
        status: "GRADED",
        totalScore: 60,
      });
    }

    const { body } = await fetchDetail(
      exam.id,
      `?classroom=${encodeURIComponent("XII IPA 1")}`,
    );

    expect(body.attempts.total).toBe(2);
    expect(
      body.attempts.items.every(
        (item) => item.student.classroom === "XII IPA 1",
      ),
    ).toBe(true);
  });

  it("R17 filter __none__ hanya siswa tanpa kelas", async () => {
    const exam = await createExam(teacherA.id);
    const [withoutClass] = await createStudents(1, null, "NoClass");
    const [withClass] = await createStudents(1, "XII IPA 1", "WithClass");

    await createAttempt(exam.id, withoutClass.id, {
      status: "GRADED",
      totalScore: 50,
    });
    await createAttempt(exam.id, withClass.id, {
      status: "GRADED",
      totalScore: 70,
    });

    const { body } = await fetchDetail(exam.id, "?classroom=__none__");

    expect(body.attempts.total).toBe(1);
    expect(body.attempts.items[0].student.classroom).toBeNull();
    expect(body.classrooms).toContain(null);
  });

  it("R18 search nama case-insensitive + filter status", async () => {
    const exam = await createExam(teacherA.id);
    const budiGraded = await createUser("Budi", "STUDENT", "XII IPA 1");
    const budiSubmitted = await createUser("Budi", "STUDENT", "XII IPA 1");
    const siti = await createUser("Siti", "STUDENT", "XII IPA 1");

    await createAttempt(exam.id, budiGraded.id, {
      status: "GRADED",
      totalScore: 80,
    });
    await createAttempt(exam.id, budiSubmitted.id, {
      status: "SUBMITTED",
      totalScore: 40,
    });
    await createAttempt(exam.id, siti.id, {
      status: "GRADED",
      totalScore: 90,
    });

    const { body } = await fetchDetail(
      exam.id,
      "?search=budi&status=GRADED",
    );

    expect(body.attempts.total).toBe(1);
    expect(body.attempts.items[0].student.id).toBe(budiGraded.id);
  });

  it("R19 list search judul + date range pada startAt", async () => {
    const marker = `Date ${randomUUID().slice(0, 6)}`;
    const march = await createExam(teacherA.id, {
      title: `${PREFIX} ${marker} March`,
      startAt: new Date("2026-03-05T00:00:00.000Z"),
    });
    await createExam(teacherA.id, {
      title: `${PREFIX} ${marker} May`,
      startAt: new Date("2026-05-05T00:00:00.000Z"),
    });
    const [student] = await createStudents(1, "XII IPA 1");

    await createAttempt(march.id, student.id, {
      status: "GRADED",
      totalScore: 60,
    });

    actAs(teacherA);
    const body = await readJson<ReportListBody>(
      await listReports(
        request(
          `/api/reports?search=${encodeURIComponent(marker)}&startFrom=2026-02-01&startTo=2026-03-31`,
        ),
      ),
    );

    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(march.id);
  });

  it("R20 pagination halaman 2 berisi siswa berikutnya", async () => {
    const exam = await createExam(teacherA.id);
    const students = await createStudents(5, "XII IPA 1", "Page");

    for (const [index, student] of students.entries()) {
      await createAttempt(exam.id, student.id, {
        status: "GRADED",
        totalScore: 50 + index,
      });
    }

    const first = await fetchDetail(exam.id, "?page=1&pageSize=2");
    const second = await fetchDetail(exam.id, "?page=2&pageSize=2");

    expect(first.body.attempts.total).toBe(5);
    expect(first.body.attempts.items).toHaveLength(2);
    expect(second.body.attempts.items).toHaveLength(2);
    expect(
      first.body.attempts.items.map((item) => item.id),
    ).not.toEqual(second.body.attempts.items.map((item) => item.id));
  });

  it("R21 late badge: > threshold, tepat threshold, dan belum submit", async () => {
    const exam = await createExam(teacherA.id);
    const students = await createStudents(3, "XII IPA 1");

    const late = await createAttempt(exam.id, students[0].id, {
      status: "GRADED",
      totalScore: 70,
      submittedAt: BASE,
      receivedAt: new Date(BASE.getTime() + LATE_SUBMISSION_THRESHOLD_MS + 1),
    });
    const onTime = await createAttempt(exam.id, students[1].id, {
      status: "GRADED",
      totalScore: 70,
      submittedAt: BASE,
      receivedAt: new Date(BASE.getTime() + LATE_SUBMISSION_THRESHOLD_MS),
    });
    const inProgress = await createAttempt(exam.id, students[2].id, {
      status: "IN_PROGRESS",
      totalScore: null,
      submittedAt: null,
      receivedAt: null,
    });

    const { body } = await fetchDetail(exam.id, "?pageSize=100");
    const byId = new Map(body.attempts.items.map((item) => [item.id, item]));

    expect(byId.get(late.id)?.isLate).toBe(true);
    expect(byId.get(onTime.id)?.isLate).toBe(false);
    expect(byId.get(inProgress.id)?.isLate).toBe(false);
  });
});

describe("Refactor regression guard", () => {
  it("R30 helper hasil extract tetap berperilaku sama (late 60s + fileResponse)", () => {
    expect(LATE_SUBMISSION_THRESHOLD_MS).toBe(60_000);
    expect(
      isLateSubmission(
        new Date(0),
        new Date(LATE_SUBMISSION_THRESHOLD_MS),
      ),
    ).toBe(false);
    expect(
      isLateSubmission(
        new Date(0),
        new Date(LATE_SUBMISSION_THRESHOLD_MS + 1),
      ),
    ).toBe(true);
    expect(isLateSubmission(null, new Date())).toBe(false);
    expect(isLateSubmission(new Date(), null)).toBe(false);

    const response = fileResponse(
      Buffer.from("hello"),
      "text/plain",
      "hasil-test.txt",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="hasil-test.txt"',
    );
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
