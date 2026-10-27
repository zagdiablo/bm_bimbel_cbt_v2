"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

import { ROLE_HOME } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

function navItemsForRole(role: Role): NavItem[] {
  return [
    { href: ROLE_HOME[role], label: "Ringkasan", icon: LayoutDashboard },
    { href: "/smoke", label: "Smoke test", icon: FlaskConical },
  ];
}

export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          CBT App
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        Fase 1 &middot; Fondasi auth &amp; RBAC
      </div>
    </aside>
  );
}
