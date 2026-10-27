import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";
import { registerSchema } from "@/lib/zod-schemas/auth";

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

  const parsed = registerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Data registrasi tidak valid",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const response = await auth.api.signUpEmail({
    body: parsed.data,
    asResponse: true,
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    const code = body?.code ?? "";
    const isDuplicate = code.startsWith("USER_ALREADY_EXISTS");

    return NextResponse.json(body ?? { message: "Registrasi gagal" }, {
      status: isDuplicate ? 409 : response.status,
    });
  }

  return copySetCookies(
    response,
    NextResponse.json(
      {
        ...body,
        redirectTo: homePathForRole(body?.user?.role),
      },
      { status: 201 },
    ),
  );
}
