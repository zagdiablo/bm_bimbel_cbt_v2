import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { HttpError, requireRole, type AuthUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const PASSWORD = "Vitest#123";
const createdEmails = new Set<string>();

function uniqueEmail() {
  const email = `vitest-${randomUUID()}@example.com`;
  createdEmails.add(email);
  return email;
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectHttpOnlySessionCookie(response: Response) {
  const cookies = response.headers.getSetCookie();
  const sessionCookie = cookies.find((cookie) =>
    cookie.includes("session_token"),
  );

  expect(sessionCookie, "session token cookie harus diset").toBeDefined();
  expect(sessionCookie?.toLowerCase()).toContain("httponly");
  expect(sessionCookie?.toLowerCase()).toContain("samesite=lax");
}

afterAll(async () => {
  if (createdEmails.size > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: [...createdEmails] } },
    });
  }

  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("registrasi valid mengembalikan 201 dan cookie HttpOnly", async () => {
    const email = uniqueEmail();

    const response = await registerRoute(
      jsonRequest("/api/auth/register", {
        name: "Siswa Vitest",
        email,
        password: PASSWORD,
      }),
    );

    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      user?: { email?: string; role?: string };
      redirectTo?: string;
    };

    expect(body.user?.email).toBe(email);
    expect(body.user?.role).toBe("STUDENT");
    expect(body.redirectTo).toBe("/student");
    expectHttpOnlySessionCookie(response);
  });

  it("registrasi dengan email duplikat mengembalikan 409", async () => {
    const email = uniqueEmail();
    const payload = { name: "Siswa Ganda", email, password: PASSWORD };

    const first = await registerRoute(
      jsonRequest("/api/auth/register", payload),
    );
    expect(first.status).toBe(201);

    const duplicate = await registerRoute(
      jsonRequest("/api/auth/register", payload),
    );
    expect(duplicate.status).toBe(409);
  });

  it("payload tidak valid mengembalikan 400", async () => {
    const response = await registerRoute(
      jsonRequest("/api/auth/register", {
        name: "X",
        email: "bukan-email",
        password: "pendek",
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("login valid mengembalikan 200 dan cookie HttpOnly", async () => {
    const email = uniqueEmail();

    const registered = await registerRoute(
      jsonRequest("/api/auth/register", {
        name: "Siswa Login",
        email,
        password: PASSWORD,
      }),
    );
    expect(registered.status).toBe(201);

    const response = await loginRoute(
      jsonRequest("/api/auth/login", { email, password: PASSWORD }),
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      user?: { email?: string; role?: string };
      redirectTo?: string;
    };

    expect(body.user?.email).toBe(email);
    expect(body.redirectTo).toBe("/student");
    expectHttpOnlySessionCookie(response);
  });

  it("password salah mengembalikan 401", async () => {
    const email = uniqueEmail();

    await registerRoute(
      jsonRequest("/api/auth/register", {
        name: "Siswa Salah",
        email,
        password: PASSWORD,
      }),
    );

    const response = await loginRoute(
      jsonRequest("/api/auth/login", {
        email,
        password: "Password#Salah",
      }),
    );

    expect(response.status).toBe(401);
  });
});

describe("requireRole", () => {
  const student: AuthUser = {
    id: "test-student",
    name: "Siswa Uji",
    email: "student@test.local",
    role: "STUDENT" as Role,
    classroom: "XII IPA 1",
  };

  it("melempar 403 ketika siswa mengakses resource ADMIN", async () => {
    await expect(requireRole(["ADMIN"], student)).rejects.toBeInstanceOf(
      HttpError,
    );
    await expect(requireRole(["ADMIN"], student)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("mengizinkan role yang cocok", async () => {
    await expect(requireRole(["STUDENT"], student)).resolves.toEqual(student);
  });
});
