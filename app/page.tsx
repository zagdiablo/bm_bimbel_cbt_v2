import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const phaseOneItems = [
  "shadcn/ui (Radix + Tailwind) menggantikan Material Tailwind v3 beta",
  "Login, registrasi, dan session better-auth",
  "RBAC di middleware dan server component",
  "Dashboard stub untuk admin, guru, dan siswa",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Fase 1
        </span>
        <h1 className="text-4xl font-bold tracking-tight">CBT App</h1>
        <p className="max-w-xl text-muted-foreground">
          Fondasi aplikasi Computer Based Test: Next.js 15, Prisma,
          PostgreSQL, better-auth, dan shadcn/ui.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Yang sudah siap</CardTitle>
          <CardDescription>
            Autentikasi berbasis role dengan proteksi route.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {phaseOneItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/login">Masuk</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">Daftar</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/smoke">Smoke test</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
