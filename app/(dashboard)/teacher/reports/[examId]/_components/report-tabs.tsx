"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, TableProperties } from "lucide-react";

import { cn } from "@/lib/utils";

export function ReportTabs({ examId }: { examId: string }) {
  const pathname = usePathname();
  const tabs = [
    {
      href: `/teacher/reports/${examId}`,
      label: "Ringkasan",
      icon: BarChart3,
    },
    {
      href: `/teacher/reports/${examId}/analytics`,
      label: "Analisis Butir",
      icon: TableProperties,
    },
  ];

  return (
    <nav
      aria-label="Navigasi laporan"
      className="flex w-fit items-center gap-1 rounded-md border bg-muted/40 p-1"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
