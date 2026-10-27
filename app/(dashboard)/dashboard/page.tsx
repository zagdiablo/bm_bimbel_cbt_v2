import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-helpers";
import { homePathForRole } from "@/lib/roles";

export default async function DashboardIndexPage() {
  const user = await requireAuth();

  redirect(homePathForRole(user.role));
}
