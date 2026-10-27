import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  finalizeAttempt,
  findAttemptByExam,
} from "@/lib/attempts/service";
import { hasExpired } from "@/lib/attempts/time";
import { requirePageRole } from "@/lib/auth-helpers";

import { TakeExamClient } from "../../_components/take-exam-client";

export const metadata: Metadata = {
  title: "Kerjakan Ujian",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function TakeExamPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requirePageRole(["STUDENT"], `/student/exams/${id}/take`);
  let attempt = await findAttemptByExam(id, user.id);

  if (!attempt) {
    redirect("/student/exams");
  }

  if (attempt.status === "IN_PROGRESS" && hasExpired(attempt.expiresAt)) {
    attempt = await finalizeAttempt(attempt.id, user.id);
  }

  if (attempt.status !== "IN_PROGRESS") {
    redirect(
      attempt.exam.showResult
        ? `/student/exams/${id}/result`
        : "/student/exams",
    );
  }

  return <TakeExamClient attemptId={attempt.id} />;
}
