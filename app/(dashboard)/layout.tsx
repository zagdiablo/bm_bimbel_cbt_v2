import { redirect } from "next/navigation";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirect=%2Fdashboard");
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      <DashboardSidebar role={user.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6">
          <span className="text-sm text-muted-foreground md:hidden">CBT App</span>
          <span className="hidden text-sm text-muted-foreground md:block">
            Selamat datang, {user.name}
          </span>
          <UserMenu name={user.name} email={user.email} role={user.role} />
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
