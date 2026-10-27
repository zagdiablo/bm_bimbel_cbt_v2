import { NextResponse } from "next/server";

import { HttpError } from "@/lib/api";
import {
  examScopeWhere,
  getExamDetailForUser,
} from "@/lib/exams/query";
import { prisma } from "@/lib/prisma";

import {
  apiError,
  requireExamManager,
  requireOwnedExam,
} from "../../_shared";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireExamManager();
    const { id } = await params;
    const exam = await requireOwnedExam(id, user);

    if (exam.status !== "PUBLISHED") {
      throw new HttpError(
        400,
        "Hanya ujian yang sudah dipublikasikan yang dapat ditutup",
      );
    }

    const closed = await prisma.exam.updateMany({
      where: {
        id,
        status: "PUBLISHED",
        ...examScopeWhere(user),
      },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
      },
    });

    if (closed.count === 0) {
      throw new HttpError(
        409,
        "Ujian sudah diproses oleh permintaan lain. Muat ulang halaman.",
      );
    }

    const detail = await getExamDetailForUser(id, user);

    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "api/exams");
  }
}
