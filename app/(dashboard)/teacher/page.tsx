import type { Metadata } from "next";
import {
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  Upload,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-helpers";

export const metadata: Metadata = {
  title: "Dashboard Guru",
};

const stats = [
  { label: "Bank soal", hint: "Soal milik Anda", icon: FileQuestion },
  { label: "Ujian", hint: "Draft & terjadwal", icon: ClipboardList },
  { label: "Impor soal", hint: "DOCX, PDF, XLSX", icon: Upload },
  { label: "Perlu dikoreksi", hint: "Jawaban esai", icon: ClipboardCheck },
];

export default async function TeacherPage() {
  const user = await requirePageRole(["TEACHER", "ADMIN"], "/teacher");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Guru</h1>
        <p className="text-muted-foreground">
          Halo {user.name}. Kelola bank soal dan ujian.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <CardDescription>{stat.hint}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fase berikutnya</CardTitle>
          <CardDescription>
            Pelaksanaan CBT (attempt), penilaian otomatis, dan rekap nilai
            dikerjakan pada fase selanjutnya.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
