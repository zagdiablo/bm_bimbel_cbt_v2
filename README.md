# CBT App

Aplikasi Computer Based Test (CBT) untuk sekolah/kampus. Repository ini sedang berada di **Fase 0**: bootstrap, database, autentikasi dasar, dan seed data.

## Prasyarat

- **Node.js 22 LTS** (lihat `.nvmrc`; `package.json` membatasi `>=22 <24`)
- **npm 10+**
- **PostgreSQL** yang dapat diakses dengan kredensial pada `.env`

## Setup 3 Langkah

1. **Siapkan environment dan dependency**

   ```bash
   nvm use
   cp .env.example .env
   # isi BETTER_AUTH_SECRET, contoh: openssl rand -hex 32
   npm install
   ```

2. **Siapkan database dan data demo**

   Pastikan database `cbt_shadow` sudah ada (lihat bagian Environment), lalu:

   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

3. **Jalankan aplikasi**

   ```bash
   npm run dev
   ```

   Buka `http://localhost:3000`. Halaman `/smoke` disediakan untuk memeriksa komponen Material Tailwind.

## Environment

Variabel yang dipakai:

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL utama |
| `SHADOW_DATABASE_URL` | Database `cbt_shadow` khusus Prisma Migrate di development |
| `BETTER_AUTH_SECRET` | Secret better-auth, minimal 32 byte acak |
| `BETTER_AUTH_URL` | Base URL aplikasi, default `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | URL publik aplikasi |

`SHADOW_DATABASE_URL` memakai database terpisah `cbt_shadow` karena role `cbt_user` pada environment lokal tidak memiliki izin `CREATEDB`. Ini hanya dipakai oleh `prisma migrate dev`; production tetap memakai `prisma migrate deploy`.

Jika `cbt_shadow` belum ada, buat sekali dengan user PostgreSQL yang punya izin `CREATEDB`:

```bash
createdb -h localhost -U <admin> -O cbt_user cbt_shadow
psql -h localhost -U <admin> -d cbt_shadow \
  -c "GRANT CONNECT, CREATE, TEMP ON DATABASE cbt_shadow TO cbt_user;"
psql -h localhost -U <admin> -d cbt_shadow \
  -c "GRANT USAGE, CREATE ON SCHEMA public TO cbt_user;"
```

Alternatifnya, beri role `cbt_user` izin `CREATEDB`, lalu hapus `shadowDatabaseUrl` dari schema dan `SHADOW_DATABASE_URL` dari `.env`. Jangan gunakan database utama sebagai shadow database karena dapat memicu reset schema `public`.

## Akun Demo

| Role | Email | Password |
|---|---|---|
| ADMIN | `admin@cbt.local` | `Admin#123` |
| TEACHER | `teacher@cbt.local` | `Teacher#123` |
| STUDENT | `student@cbt.local` | `Student#123` |

Password hanya untuk data seed lokal. Ganti sebelum dipakai di lingkungan nyata.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm start          # menjalankan hasil build
npm run lint       # ESLint
npm run typecheck  # TypeScript tanpa emit
npm run test       # Vitest (single run)
npm run test:watch # Vitest watch
npm run db:seed    # seed data demo
npm run db:reset   # reset database + migrasi + seed
```

## Keputusan Teknis Fase 0

### Material Tailwind

- Tidak ada rilis **v3 stable** di npm. Versi terbaru adalah `2.1.10`; versi v3 hanya tersedia sebagai `3.0.0-beta.24`.
- Sesuai urutan evaluasi, dipakai **`@material-tailwind/react@3.0.0-beta.24`**.
- Smoke test di `/smoke` mencakup Button, Input, Select, Dialog, Alert, dan Card: seluruhnya berhasil dirender dan berinteraksi tanpa error console/build.
- Material Tailwind **tidak mengekspor komponen Table** (baik v2 maupun v3 beta). Tabel aplikasi memakai elemen HTML semantik dengan utility Tailwind dan dibungkus Card, bukan design system baru.
- `ThemeProvider` v3 beta memicu `RangeError: Maximum call stack size exceeded` saat ikut SSR di Next.js 15 development. Provider karena itu di-mount setelah hydration di `components/providers.tsx`; komponen tetap memakai default theme sebelum provider aktif.
- Tailwind yang dipakai adalah **v3.4**, bukan v4, karena konfigurasi plugin Material Tailwind masih berbasis konfigurasi Tailwind v3.
- `tailwindcss-animate` ditambahkan karena plugin v3 beta mengimpornya tetapi tidak mendeklarasikannya sebagai dependency.
- Karena memakai v3 beta, tidak ada `overrides` React 19 untuk Material Tailwind v2.

### PDF parser

`pdf-parse` yang terpasang adalah **2.4.5** (bukan 1.1.1). Versi ini masih dipelihara dan memiliki build Node 22. Parser PDF akan memakai API `PDFParse` pada Fase 3. Jika ada masalah kompatibilitas saat integrasi, fallback-nya adalah `pdfjs-dist` langsung.

### Auth dan schema

- better-auth menyimpan password pada model `Account`, bukan `User.hashedPassword`, sesuai skema resmi better-auth.
- Role disimpan sebagai enum Prisma `Role` dan diekspos sebagai additional field better-auth.
- Cookie session diset `httpOnly`, `SameSite=Lax`, dan `Secure` hanya ketika base URL memakai HTTPS.
- Halaman login/register dan RBAC belum dibuat; itu masuk Fase 1.

## Struktur Saat Ini

```text
app/
  api/auth/[...all]/route.ts
  smoke/page.tsx
  globals.css
  layout.tsx
  page.tsx
components/
  providers.tsx
lib/
  auth.ts
  prisma.ts
prisma/
  migrations/
  schema.prisma
  seed.ts
public/
.env.example
.nvmrc
```

## Fase Berikutnya

Fase 1 akan menambahkan halaman login/register, redirect per role, middleware, dan helper `requireRole` untuk API.
