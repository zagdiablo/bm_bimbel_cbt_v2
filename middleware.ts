import { NextResponse, type NextRequest } from "next/server";
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import type { Role } from "@prisma/client";

const ROLE_RULES: ReadonlyArray<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  // ADMIN is a super-user inside the teacher workspace (Bank Soal, exams).
  { prefix: "/teacher", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/student", roles: ["STUDENT"] },
];

type CachedSession = {
  user?: {
    role?: string;
  };
};

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Cheap Edge-safe check: does a session cookie exist at all?
  const sessionToken = getSessionCookie(request);

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  const rule = ROLE_RULES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!rule) {
    return NextResponse.next();
  }

  // The signed session-data cookie carries the user role. It is short lived
  // (5 minutes), so when it is missing or expired we let the request through
  // and rely on the server-component guard for the authoritative check.
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  try {
    const cache = (await getCookieCache(request, {
      secret: process.env.BETTER_AUTH_SECRET,
      isSecure: baseURL.startsWith("https://"),
    })) as CachedSession | null;
    const role = cache?.user?.role;

    if (role && !rule.roles.includes(role as Role)) {
      return NextResponse.redirect(new URL("/403", request.url));
    }
  } catch {
    // Fall through: the server component will enforce the role with Prisma.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/dashboard/:path*",
  ],
};
