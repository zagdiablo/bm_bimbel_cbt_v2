import { HttpError } from "@/lib/api";
import { attemptIntegrityError } from "@/lib/attempts/payload";
import { finalizeAttempt } from "@/lib/attempts/service";
import { hasExpired, nowDate } from "@/lib/attempts/time";
import type { AuthUser } from "@/lib/auth-helpers";
import { examScopeWhere } from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";

import { getGradingDetail, gradingAttemptInclude } from "./query";
import { resolvePoints, summarizeAttemptScore } from "./recompute";
import { parseGradingSnapshot } from "./snapshot";
import type { GradingDetail } from "./types";

export type ScoringMode = "ESSAY" | "SHORT_ANSWER";

type ScoreInput = {
  score: number;
  baseRevision: number;
};

/**
 * Menyimpan nilai manual satu soal.
 *
 * - ESSAY: hanya saat attempt SUBMITTED; setelah GRADED hanya ADMIN.
 * - SHORT_ANSWER: koreksi auto-grade. TEACHER tetap boleh mengoreksi meski
 *   attempt sudah GRADED, karena normalisasi jawaban singkat bersifat
 *   heuristik. Perubahan ini bukan regrade essay.
 *
 * Attempt selalu dikunci (`SELECT ... FOR UPDATE`) di awal transaksi supaya
 * dua penilaian essay terakhir yang bersamaan tidak sama-sama melihat state
 * lama dan meninggalkan attempt stuck SUBMITTED.
 */
export async function saveQuestionScore(
  attemptId: string,
  examQuestionId: string,
  input: ScoreInput,
  user: AuthUser,
  mode: ScoringMode,
  options: { now?: Date } = {},
): Promise<GradingDetail> {
  const now = options.now ?? nowDate();
  const pre = await prisma.attempt.findFirst({
    where: { id: attemptId, exam: { is: examScopeWhere(user) } },
    select: {
      id: true,
      studentId: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!pre) {
    throw new HttpError(404, "Attempt tidak ditemukan");
  }

  if (pre.status === "IN_PROGRESS") {
    if (!hasExpired(pre.expiresAt, now)) {
      throw new HttpError(409, "Attempt masih dikerjakan siswa");
    }

    await finalizeAttempt(pre.id, pre.studentId, { now });
  }

  await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "attempts" WHERE "id" = ${attemptId} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new HttpError(404, "Attempt tidak ditemukan");
      }

      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, exam: { is: examScopeWhere(user) } },
        include: gradingAttemptInclude,
      });

      if (!attempt) {
        throw new HttpError(404, "Attempt tidak ditemukan");
      }

      if (attempt.status === "IN_PROGRESS") {
        throw new HttpError(409, "Attempt masih dikerjakan siswa");
      }

      if (
        attempt.status === "GRADED" &&
        mode === "ESSAY" &&
        user.role !== "ADMIN"
      ) {
        throw new HttpError(
          409,
          "Attempt sudah dinilai. Hanya admin yang dapat mengubah nilai esai.",
        );
      }

      const questions = await tx.examQuestion.findMany({
        where: { examId: attempt.examId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          pointsOverride: true,
          snapshotJson: true,
        },
      });
      const parsed = questions.map((question) => {
        const snapshot = parseGradingSnapshot(question.snapshotJson, {
          attemptId,
          examId: attempt.examId,
          examQuestionId: question.id,
        });

        return {
          id: question.id,
          order: question.order,
          pointsOverride: question.pointsOverride,
          points: resolvePoints(question.pointsOverride, snapshot.points),
          snapshot,
        };
      });
      const target = parsed.find(
        (question) => question.id === examQuestionId,
      );

      if (!target) {
        throw new HttpError(404, "Soal tidak ditemukan pada ujian ini");
      }

      if (target.snapshot.type !== mode) {
        throw new HttpError(
          400,
          mode === "ESSAY"
            ? "Soal ini bukan soal esai"
            : "Soal ini bukan soal jawaban singkat",
        );
      }

      if (!attempt.questionOrder.includes(examQuestionId)) {
        throw attemptIntegrityError(
          "soal tidak tercatat pada questionOrder attempt",
          { attemptId, examId: attempt.examId, examQuestionId },
        );
      }

      if (
        !Number.isInteger(input.score) ||
        input.score < 0 ||
        input.score > target.points
      ) {
        throw new HttpError(
          400,
          `Nilai harus bilangan bulat antara 0 dan ${target.points}`,
        );
      }

      const existing = attempt.answers.find(
        (answer) => answer.examQuestionId === examQuestionId,
      );

      if (existing) {
        if (existing.revision !== input.baseRevision) {
          throw new HttpError(
            409,
            `Nilai sudah berubah (revision ${existing.revision}). Muat ulang halaman.`,
          );
        }

        await tx.answer.update({
          where: { id: existing.id },
          data: {
            score: input.score,
            isCorrect:
              mode === "ESSAY" ? null : input.score === target.points,
            gradedAt: now,
            gradedById: user.id,
            revision: { increment: 1 },
          },
        });
      } else {
        if (input.baseRevision !== 0) {
          throw new HttpError(
            409,
            "Jawaban belum tersedia. Muat ulang halaman.",
          );
        }

        await tx.answer.create({
          data: {
            attemptId,
            examQuestionId,
            selectedLabels: [],
            textAnswer: null,
            isCorrect:
              mode === "ESSAY" ? null : input.score === target.points,
            score: input.score,
            revision: 1,
            answeredAt: attempt.submittedAt ?? now,
            gradedAt: now,
            gradedById: user.id,
          },
        });
      }

      const answers = await tx.answer.findMany({
        where: { attemptId },
        select: { examQuestionId: true, score: true },
      });
      const summary = summarizeAttemptScore(
        parsed.map((question) => ({
          id: question.id,
          type: question.snapshot.type,
          points: question.points,
        })),
        answers,
        { attemptId, examId: attempt.examId },
      );

      if (summary.totalScore > attempt.maxScore) {
        throw attemptIntegrityError(
          `totalScore ${summary.totalScore} melebihi maxScore ${attempt.maxScore}`,
          { attemptId, examId: attempt.examId },
        );
      }

      if (attempt.status === "GRADED" && summary.pendingEssayCount > 0) {
        throw attemptIntegrityError(
          "attempt berstatus GRADED masih memiliki essay yang belum dinilai",
          { attemptId, examId: attempt.examId },
        );
      }

      if (
        attempt.status === "SUBMITTED" &&
        summary.pendingEssayCount === 0
      ) {
        await tx.attempt.update({
          where: { id: attemptId },
          data: {
            status: "GRADED",
            totalScore: summary.totalScore,
            gradedAt: now,
            gradedById: user.id,
          },
        });

        return;
      }

      await tx.attempt.update({
        where: { id: attemptId },
        data: { totalScore: summary.totalScore },
      });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return getGradingDetail(attemptId, user);
}
