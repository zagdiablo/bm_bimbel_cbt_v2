import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";
import { loginSchema } from "@/lib/zod-schemas/auth";

import { copySetCookies, readJsonResponse } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Body request harus berupa JSON" },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Data login tidak valid",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const response = await auth.api.signInEmail({
    body: parsed.data,
    asResponse: true,
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    return NextResponse.json(body ?? { message: "Email atau password salah" }, {
      status: response.status === 401 ? 401 : response.status,
    });
  }

  return copySetCookies(
    response,
    NextResponse.json(
      {
        ...body,
        redirectTo: homePathForRole(body?.user?.role),
      },
      { status: 200 },
    ),
  );
}
