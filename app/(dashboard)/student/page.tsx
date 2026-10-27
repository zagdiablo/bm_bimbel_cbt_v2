import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listStudentAttempts,
  listStudentExams,
} from "@/lib/attempts/service";
import { requirePageRole } from "@/lib/auth-helpers";

export const metadata: Metadata = {
  title: "Dashboard Siswa",
};

export default async function StudentPage() {
  const user = await requirePageRole(["STUDENT"], "/student");
  const [exams, attempts] = await Promise.all([
    listStudentExams(user.id),
    listStudentAttempts(user.id),
  ]);
  const unfinished = attempts.items.filter(
    (attempt) => attempt.status === "IN_PROGRESS",
  ).length;

  const stats = [
    {
      label: "Ujian aktif",
      value: exams.items.length,
      hint: "Ujian yang sedang dibuka",
      icon: CalendarClock,
    },
    {
      label: "Riwayat ujian",
      value: attempts.items.length,
      hint:
        unfinished > 0
          ? `${unfinished} attempt masih berjalan`
          : "Termasuk ujian yang sudah selesai",
      icon: History,
    },
  ];

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
                <div className="text-2xl font-bold">{stat.value}</div>
                <CardDescription>{stat.hint}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ujian Saya</CardTitle>
          <CardDescription>
            Lihat ujian yang sedang dibuka, gabung dengan token dari guru, dan
            lanjutkan ujian yang sudah dimulai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/student/exams">Buka daftar ujian</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
