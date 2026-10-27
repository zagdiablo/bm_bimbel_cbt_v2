import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-helpers";
import { homePathForRole } from "@/lib/roles";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(homePathForRole(user.role));
  }

  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-xl border bg-card" />}>
      <LoginForm />
    </Suspense>
  );
}
