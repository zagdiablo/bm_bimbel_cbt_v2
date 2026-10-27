import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Akses ditolak",
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <CardTitle>403 — Akses ditolak</CardTitle>
          <CardDescription>
            Akun Anda tidak memiliki role yang diperlukan untuk membuka halaman
            ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">Ke dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Beranda</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
