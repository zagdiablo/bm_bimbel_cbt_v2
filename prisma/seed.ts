import "dotenv/config";
import { Difficulty, QuestionType, Role } from "@prisma/client";
import { auth } from "../lib/auth";
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

async function main() {
  await seedUsers();
  await seedSubjectAndQuestions();

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
