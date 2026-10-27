import type { Metadata } from "next";
import { BookOpen, FileQuestion, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageRole } from "@/lib/auth-helpers";

export const metadata: Metadata = {
  title: "Dashboard Admin",
};

const stats = [
  { label: "Pengguna", hint: "Manajemen akun", icon: Users },
  { label: "Mata pelajaran", hint: "Data master", icon: BookOpen },
  { label: "Bank soal", hint: "Semua mata pelajaran", icon: FileQuestion },
];

export default async function AdminPage() {
  const user = await requirePageRole(["ADMIN"], "/admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Admin</h1>
        <p className="text-muted-foreground">
          Halo {user.name}. Ringkasan administrasi sistem CBT.
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
          <CardTitle>Modul berikutnya</CardTitle>
          <CardDescription>
            Manajemen pengguna, mata pelajaran, dan bank soal dikerjakan pada fase
            selanjutnya.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
