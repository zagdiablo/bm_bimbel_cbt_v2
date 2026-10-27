import type { Metadata } from "next";
import { CalendarClock, History } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-helpers";

export const metadata: Metadata = {
  title: "Dashboard Siswa",
};

const stats = [
  { label: "Ujian tersedia", hint: "Ujian yang dibuka", icon: CalendarClock },
  { label: "Riwayat nilai", hint: "Hasil ujian sebelumnya", icon: History },
];

export default async function StudentPage() {
  const user = await requirePageRole(["STUDENT"], "/student");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Siswa</h1>
        <p className="text-muted-foreground">
          Halo {user.name}
          {user.classroom ? ` (${user.classroom})` : ""}. Siap mengerjakan ujian?
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">—</div>
                <CardDescription>Belum ada data</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modul berikutnya</CardTitle>
          <CardDescription>
            Daftar ujian, pengerjaan soal, dan rekap nilai dikerjakan pada fase
            selanjutnya.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
