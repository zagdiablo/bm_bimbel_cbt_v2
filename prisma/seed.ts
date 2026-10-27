import "dotenv/config";
import { Difficulty, QuestionType, Role } from "@prisma/client";
import { auth } from "../lib/auth";
import { buildExamSnapshot } from "../lib/exams/snapshot";
import { prisma } from "../lib/prisma";

const demoUsers = [
  {
    email: "admin@cbt.local",
    password: "Admin#123",
    name: "Administrator CBT",
    role: Role.ADMIN,
    classroom: null,
  },
  {
    email: "teacher@cbt.local",
    password: "Teacher#123",
    name: "Guru Demo",
    role: Role.TEACHER,
    classroom: null,
  },
  {
    email: "student@cbt.local",
    password: "Student#123",
    name: "Siswa Demo",
    role: Role.STUDENT,
    classroom: "XII IPA 1",
  },
] as const;

async function seedUsers() {
  for (const demo of demoUsers) {
    const existing = await prisma.user.findUnique({
      where: { email: demo.email },
    });

    if (!existing) {
      const result = await auth.api.signUpEmail({
        body: {
          email: demo.email,
          password: demo.password,
          name: demo.name,
        },
      });

      if (!result.user) {
        throw new Error(`Gagal membuat user ${demo.email}`);
      }
    }

    await prisma.user.update({
      where: { email: demo.email },
      data: {
        name: demo.name,
        role: demo.role,
        classroom: demo.classroom,
        emailVerified: true,
      },
    });
  }
}

async function seedSubjectAndQuestions() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@cbt.local" },
  });

  const subject = await prisma.subject.upsert({
    where: { code: "MTK" },
    update: {
      name: "Matematika",
      ownerId: teacher.id,
    },
    create: {
      name: "Matematika",
      code: "MTK",
      ownerId: teacher.id,
    },
  });

  const questions = [
    {
      id: "demo-q1",
      type: QuestionType.SINGLE_CHOICE,
      questionText: "Hasil dari 2 + 2 adalah ...",
      explanation: "Dua ditambah dua sama dengan empat.",
      difficulty: Difficulty.EASY,
      points: 1,
      options: [
        { label: "A", text: "3", isCorrect: false, order: 1 },
        { label: "B", text: "4", isCorrect: true, order: 2 },
        { label: "C", text: "5", isCorrect: false, order: 3 },
        { label: "D", text: "6", isCorrect: false, order: 4 },
      ],
    },
    {
      id: "demo-q2",
      type: QuestionType.MULTIPLE_CHOICE,
      questionText: "Manakah yang merupakan bilangan prima kurang dari 10?",
      explanation: "Bilangan prima kurang dari 10 adalah 2, 3, 5, dan 7.",
      difficulty: Difficulty.MEDIUM,
      points: 2,
      options: [
        { label: "A", text: "2", isCorrect: true, order: 1 },
        { label: "B", text: "3", isCorrect: true, order: 2 },
        { label: "C", text: "4", isCorrect: false, order: 3 },
        { label: "D", text: "5", isCorrect: true, order: 4 },
        { label: "E", text: "9", isCorrect: false, order: 5 },
      ],
    },
    {
      id: "demo-q3",
      type: QuestionType.TRUE_FALSE,
      questionText: "7 adalah bilangan prima.",
      explanation: "7 hanya habis dibagi 1 dan 7.",
      difficulty: Difficulty.EASY,
      points: 1,
      options: [
        { label: "A", text: "Benar", isCorrect: true, order: 1 },
        { label: "B", text: "Salah", isCorrect: false, order: 2 },
      ],
    },
    {
      id: "demo-q4",
      type: QuestionType.SHORT_ANSWER,
      questionText: "Berapakah hasil dari 9 x 8?",
      explanation: "9 x 8 = 72.",
      difficulty: Difficulty.MEDIUM,
      points: 1,
      options: [{ label: "KUNCI", text: "72", isCorrect: true, order: 0 }],
    },
    {
      id: "demo-q5",
      type: QuestionType.ESSAY,
      questionText:
        "Jelaskan langkah-langkah menyelesaikan persamaan 2x + 4 = 10.",
      explanation:
        "Kurangi 4 dari kedua sisi sehingga 2x = 6, lalu bagi kedua sisi dengan 2 sehingga x = 3.",
      difficulty: Difficulty.HARD,
      points: 5,
      options: [],
    },
  ];

  for (const question of questions) {
    await prisma.question.upsert({
      where: { id: question.id },
      update: {
        subjectId: subject.id,
        ownerId: teacher.id,
        type: question.type,
        questionText: question.questionText,
        explanation: question.explanation,
        difficulty: question.difficulty,
        points: question.points,
        deletedAt: null,
        options: {
          deleteMany: {},
          create: question.options,
        },
      },
      create: {
        id: question.id,
        subjectId: subject.id,
        ownerId: teacher.id,
        type: question.type,
        questionText: question.questionText,
        explanation: question.explanation,
        difficulty: question.difficulty,
        points: question.points,
        options: {
          create: question.options,
        },
      },
    });
  }
}

async function seedDemoExam() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@cbt.local" },
  });
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { code: "MTK" },
  });
  const demoStudent = await prisma.user.findUnique({
    where: { email: "student@cbt.local" },
    select: { id: true },
  });
  const nonDemoAttempts = await prisma.attempt.count({
    where: {
      examId: "demo-exam-1",
      ...(demoStudent ? { studentId: { not: demoStudent.id } } : {}),
    },
  });

  if (nonDemoAttempts > 0) {
    throw new Error(
      `Seed dibatalkan: demo-exam-1 memiliki ${nonDemoAttempts} attempt non-demo. ` +
        "Jalankan db:reset atau hapus attempt tersebut secara eksplisit.",
    );
  }

  const now = Date.now();
  const startAt = new Date(now - 60 * 60 * 1000);
  const endAt = new Date(now + 2 * 60 * 60 * 1000);
  const publishedAt = new Date(now);

  const exam = await prisma.exam.upsert({
    where: { id: "demo-exam-1" },
    update: {
      title: "Ulangan Harian Matematika",
      subjectId: subject.id,
      ownerId: teacher.id,
      durationMinutes: 90,
      startAt,
      endAt,
      token: "DEMO26",
      shuffleQuestions: false,
      shuffleOptions: true,
      showResult: true,
      status: "PUBLISHED",
      publishedAt,
      closedAt: null,
    },
    create: {
      id: "demo-exam-1",
      title: "Ulangan Harian Matematika",
      subjectId: subject.id,
      ownerId: teacher.id,
      durationMinutes: 90,
      startAt,
      endAt,
      token: "DEMO26",
      shuffleQuestions: false,
      shuffleOptions: true,
      showResult: true,
      status: "PUBLISHED",
      publishedAt,
    },
  });

  // Hanya attempt milik siswa demo yang di-reset. Attempt user lain pada
  // demo-exam-1 sudah ditolak di atas, sehingga histori real tidak terhapus.
  // Answers ikut cascade saat attempt dihapus. Baru setelah itu ExamQuestion
  // dibangun ulang (FK Answer→ExamQuestion memakai Restrict).
  if (demoStudent) {
    await prisma.attempt.deleteMany({
      where: { examId: exam.id, studentId: demoStudent.id },
    });
  }
  await prisma.examQuestion.deleteMany({ where: { examId: exam.id } });

  const demoQuestionIds = [
    "demo-q1",
    "demo-q2",
    "demo-q3",
    "demo-q4",
    "demo-q5",
  ];

  for (const [index, questionId] of demoQuestionIds.entries()) {
    const question = await prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      include: {
        options: {
          orderBy: [{ order: "asc" }, { label: "asc" }],
        },
      },
    });

    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        questionId,
        order: index + 1,
        snapshotJson: buildExamSnapshot(question, publishedAt),
      },
    });
  }
}

async function main() {
  await seedUsers();
  await seedSubjectAndQuestions();
  await seedDemoExam();

  console.log("Seed selesai.");
  console.log("Admin   : admin@cbt.local / Admin#123");
  console.log("Teacher : teacher@cbt.local / Teacher#123");
  console.log("Student : student@cbt.local / Student#123");
}

main()
  .catch((error: unknown) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
