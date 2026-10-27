import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-helpers";
import { homePathForRole } from "@/lib/roles";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Daftar",
};

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(homePathForRole(user.role));
  }

  return <RegisterForm />;
}
