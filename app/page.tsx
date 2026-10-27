import { Button, Card, CardBody, Typography } from "@material-tailwind/react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-info px-3 py-1 text-xs font-medium text-info-foreground">
          Fase 0
        </span>
        <Typography variant="h2">CBT App</Typography>
        <Typography className="max-w-xl opacity-70">
          Fondasi aplikasi Computer Based Test: Next.js 15, Prisma,
          PostgreSQL, better-auth, dan Material Tailwind.
        </Typography>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <Typography variant="h6">Yang sudah siap</Typography>
          <ul className="list-inside list-disc space-y-1 text-sm opacity-80">
            <li>Schema Prisma dan migrasi awal</li>
            <li>Seed 3 role, 1 mata pelajaran, dan 5 tipe soal</li>
            <li>better-auth route handler dan session cookie httpOnly</li>
            <li>Material Tailwind provider dan smoke test komponen</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <Button as="a" href="/smoke">
              Buka smoke test
            </Button>
            <Button
              as="a"
              href="/api/auth/get-session"
              variant="outline"
              color="secondary"
            >
              Cek auth handler
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
