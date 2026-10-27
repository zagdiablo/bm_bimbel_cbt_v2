import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/prisma";

const PASSWORD = "Vitest#123";
const createdEmails = new Set<string>();

function uniqueEmail() {
  const email = `vitest-e2e-auth-${randomUUID()}@example.com`;
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

afterAll(async () => {
  if (createdEmails.size > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: [...createdEmails] } },
    });
  }

  await prisma.$disconnect();
});

describe("A10a — auth flow smoke", () => {
  it(
    "register lalu login menghasilkan cookie HttpOnly dan redirect benar",
    async () => {
      const email = uniqueEmail();

      const registered = await registerRoute(
        jsonRequest("/api/auth/register", {
          name: "Siswa E2E Auth",
          email,
          password: PASSWORD,
        }),
      );

      expect(registered.status).toBe(201);

      const login = await loginRoute(
        jsonRequest("/api/auth/login", { email, password: PASSWORD }),
      );

      expect(login.status).toBe(200);

      const body = (await login.json()) as {
        user?: { email?: string; role?: string };
        redirectTo?: string;
      };

      expect(body.user?.email).toBe(email);
      expect(body.user?.role).toBe("STUDENT");
      expect(body.redirectTo).toBe("/student");

      const sessionCookie = login.headers
        .getSetCookie()
        .find((cookie) => cookie.includes("session_token"));

      expect(sessionCookie, "session token cookie harus diset").toBeDefined();
      expect(sessionCookie?.toLowerCase()).toContain("httponly");
      expect(sessionCookie?.toLowerCase()).toContain("samesite=lax");
    },
    60_000,
  );
});
