# CBT App

Aplikasi Computer Based Test (CBT) untuk sekolah/kampus. Repository ini berada di **Fase 1**: migrasi UI ke shadcn/ui, autentikasi better-auth, RBAC, dan dashboard stub per role.

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

   Buka `http://localhost:3000`. Halaman `/smoke` tersedia untuk memeriksa komponen shadcn/ui.

## Environment

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL utama |
| `SHADOW_DATABASE_URL` | Database `cbt_shadow` khusus Prisma Migrate di development |
| `BETTER_AUTH_SECRET` | Secret better-auth, minimal 32 byte acak. Dipakai juga untuk verifikasi cookie cache di middleware |
| `BETTER_AUTH_URL` | Base URL aplikasi, default `http://localhost:3000`. Menentukan atribut `Secure` cookie |
| `NEXT_PUBLIC_APP_URL` | URL publik aplikasi, ikut didaftarkan sebagai trusted origin |

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

## Akun Demo (Seed)

| Role | Email | Password | Redirect setelah login |
|---|---|---|---|
| ADMIN | `admin@cbt.local` | `Admin#123` | `/admin` |
| TEACHER | `teacher@cbt.local` | `Teacher#123` | `/teacher` |
| STUDENT | `student@cbt.local` | `Student#123` | `/student` |

Password hanya untuk data seed lokal. Ganti sebelum dipakai di lingkungan nyata.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm start          # menjalankan hasil build
npm run lint       # ESLint (flat config)
npm run typecheck  # TypeScript tanpa emit
npm run test       # Vitest (single run)
npm run test:watch # Vitest watch
npm run db:seed    # seed data demo
npm run db:reset   # reset database + migrasi + seed
```

## Stack Fase 1

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 15.5 App Router, React 19, TypeScript strict |
| UI | shadcn/ui (Radix UI + Tailwind CSS v3.4), style `new-york`, base color `zinc`, CSS variables |
| Ikon | `lucide-react` |
| Form | `react-hook-form` + `@hookform/resolvers` + Zod |
| Auth | better-auth 1.7 (email & password, scrypt) |
| Database | Prisma 6 + PostgreSQL |
| Test | Vitest 3 |

## Migrasi Material Tailwind → shadcn/ui

Ini adalah **deviasi stack yang diotorisasi** pada Fase 1.

**Alasan pindah**

- Material Tailwind v3 hanya tersedia sebagai beta (`3.0.0-beta.24`) dan memicu `RangeError: Maximum call stack size exceeded` saat SSR di Next.js 15.
- Workaround Fase 0 (menunda `ThemeProvider` sampai hydration) menyebabkan FOUC dan tidak layak untuk aplikasi ujian.
- shadcn/ui memakai Radix UI + Tailwind, SSR-safe, tidak butuh provider client, dan menyediakan Table/Dialog/Select/Form yang dibutuhkan CBT.

**Keputusan teknis**

- `@material-tailwind/react` dan `components/providers.tsx` dihapus. `app/layout.tsx` kini hanya memuat `globals.css` dan `Toaster`.
- shadcn CLI **dipin ke `2.3.0`**. CLI `@latest` (4.x) hanya mendukung Tailwind v4 dan memakai preset baru, sedangkan proyek ini memakai Tailwind v3.4. Dokumentasi shadcn menyatakan proyek Tailwind v3 memakai `shadcn@2.3.0`.
- `components.json`: `style: "new-york"`, `baseColor: "zinc"`, `cssVariables: true`, `rsc: true`, alias `@/components` dan `@/lib/utils`.
- CLI 2.3.0 menulis token warna dalam format `oklch(...)`, sementara `tailwind.config.ts` v3 membungkus variabel dengan `hsl(var(--…))`. Kombinasi itu menghasilkan warna invalid. `app/globals.css` karena itu ditulis ulang memakai **palet HSL zinc klasik shadcn v3**.
- `tailwindcss-animate` dihapus bersama Material Tailwind, lalu **dipasang kembali** karena shadcn/ui membutuhkannya untuk animasi Radix (`data-[state=open]:animate-in`, dsb.). Sekarang dependensi shadcn, bukan Material Tailwind.
- Tidak ada `ThemeProvider`, tidak ada komponen yang di-mount setelah hydration. Seluruh halaman dirender penuh di server; tidak ada FOUC.
- Build menghasilkan peringatan Edge Runtime dari `jose` (`DecompressionStream`) yang ikut ter-bundle lewat `better-auth/cookies`. Modul deflate tersebut tidak dipakai oleh strategi cookie cache `compact`, dan RBAC middleware sudah diverifikasi berjalan di runtime Edge.

## Auth & RBAC

### better-auth

- `lib/auth.ts` mengaktifkan email & password, `minPasswordLength: 8`, dan `autoSignIn`.
- Password di-hash dengan **scrypt bawaan better-auth**. `bcryptjs` tidak dipakai oleh kode mana pun (seed pun memakai `auth.api.signUpEmail`), sehingga dihapus dari dependencies.
- `additionalFields`:
  - `role` (`string`, default `STUDENT`, `input: false`)
  - `classroom` (`string`, opsional, `input: false`)
- `input: false` berarti register publik tidak dapat mengirim `role`/`classroom`. Zod schema juga men-strip field tak dikenal, jadi tidak ada privilege escalation lewat `/api/auth/register`.
- Session berlaku 7 hari, `updateAge` 1 hari, dan cookie cache 5 menit. Cookie `httpOnly`, `SameSite=Lax`, `Secure` hanya bila base URL HTTPS.

### Endpoint wrapper

better-auth mengembalikan `200` untuk registrasi sukses dan `422` untuk email duplikat. Agar kontrak API eksplisit, dua endpoint tipis membungkus API server better-auth dan meneruskan cookie sesi:

| Endpoint | Sukses | Gagal |
|---|---|---|
| `POST /api/auth/register` | `201` + cookie | `409` duplikat, `400` validasi |
| `POST /api/auth/login` | `200` + cookie + `redirectTo` | `401` kredensial salah, `400` validasi |
| `POST /api/auth/sign-out` (catch-all better-auth) | `200` | — |

`Set-Cookie` dari better-auth disalin ke response wrapper, sehingga sesi tetap valid. `redirectTo` berisi `/admin`, `/teacher`, atau `/student` sesuai role.

### Helper

`lib/auth-helpers.ts` menyediakan:

- `getCurrentUser()` — session + user, di-cache per request dengan React `cache`.
- `requireAuth()` — melempar `HttpError(401)` bila belum login.
- `requireRole(roles)` — melempar `HttpError(403)` bila role tidak cocok. Parameter kedua opsional untuk injeksi user pada test.
- `requirePageRole(roles, path)` — versi server component yang `redirect()` ke `/login?redirect=…` atau `/403`.

`lib/zod-schemas/auth.ts` menyediakan `loginSchema` dan `registerSchema` (email dinormalisasi trim + lowercase, password 8–128 karakter, nama 2–100 karakter).

### Middleware

`middleware.ts` memproteksi `/admin/*`, `/teacher/*`, `/student/*`, dan `/dashboard/*`:

1. Tidak ada cookie sesi → redirect ke `/login?redirect=<path>`.
2. Role dari signed cookie cache tidak cocok → redirect ke `/403`.
3. Cookie cache kedaluwarsa (5 menit) → request diteruskan, lalu server component/layout melakukan pengecekan ulang ke database.

Fallback ini mencegah redirect loop dan tetap membuat database sebagai sumber kebenaran role.

### Redirect

Setelah login, user diarahkan ke `redirect` yang diminta (bila ada), lalu `redirectTo` dari server, lalu home sesuai role. `safeRedirectPath()` hanya menerima path internal yang diawali `/` dan menolak `//host` maupun URL absolut, sehingga tidak ada open redirect.

## Testing

```bash
npm test
```

`tests/auth.test.ts` menguji route handler secara langsung (tanpa server HTTP):

- registrasi valid → `201` + cookie `HttpOnly` + `SameSite=Lax`
- registrasi duplikat → `409`
- payload registrasi tidak valid → `400`
- login valid → `200` + cookie `HttpOnly` + `redirectTo: "/student"`
- password salah → `401`
- `requireRole(["ADMIN"])` dengan user siswa → `HttpError` status `403`
- `requireRole(["STUDENT"])` dengan user siswa → lolos

Test memakai database pada `DATABASE_URL` dan membersihkan user `vitest-*@example.com` di `afterAll`.

## Verifikasi Fase 1

Dijalankan pada Node 22.23.4:

- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos tanpa warning
- `npm test` → 7 test lolos
- `npm run build` → lolos, 13 route + middleware
- `GET /smoke` → `200`, HTML berisi konten dan tabel yang dirender server; tidak ada stack overflow
- CSS hasil build berisi token `--background: 0 0% 100%`, bukan `oklch`

Perilaku RBAC via `curl` pada `next start`:

| Request | Hasil |
|---|---|
| `GET /admin` tanpa login | `307` → `/login?redirect=%2Fadmin` |
| `POST /api/auth/login` admin | `200`, `redirectTo: "/admin"` |
| `POST /api/auth/login` teacher | `200`, `redirectTo: "/teacher"` |
| `POST /api/auth/login` student | `200`, `redirectTo: "/student"` |
| `GET /admin` sebagai admin | `200` |
| `GET /admin` sebagai teacher/student | `307` → `/403` |
| `GET /teacher` sebagai teacher | `200` |
| `GET /student` sebagai student | `200` |
| `GET /dashboard` sebagai student | `307` → `/student` |

## Struktur Saat Ini

```text
app/
  (auth)/
    layout.tsx
    login/{page.tsx, login-form.tsx}
    register/{page.tsx, register-form.tsx}
  (dashboard)/
    layout.tsx
    dashboard/page.tsx
    admin/page.tsx
    teacher/page.tsx
    student/page.tsx
  403/page.tsx
  api/auth/
    [...all]/route.ts
    _shared.ts
    login/route.ts
    register/route.ts
  globals.css
  layout.tsx
  page.tsx
  smoke/page.tsx
components/
  dashboard/{sidebar.tsx, user-menu.tsx}
  ui/{alert, button, card, dialog, dropdown-menu, form, input, label, select, table, toast, toaster}.tsx
hooks/
  use-toast.ts
lib/
  auth.ts
  auth-client.ts
  auth-helpers.ts
  prisma.ts
  roles.ts
  utils.ts
  zod-schemas/auth.ts
middleware.ts
tests/
  auth.test.ts
  setup.ts
prisma/
  migrations/
  schema.prisma
  seed.ts
```

## Catatan Keamanan & Utang Teknis

- `npm audit` (production deps) mencatat: `xlsx` high tanpa fix tersedia, `zod` high yang perbaikannya butuh Zod v4 (breaking), serta advisory pada `next`, `prisma`, dan `vitest` yang hanya dapat diselesaikan dengan upgrade mayor. Belum ada yang dieksploitasi di Fase 1, tetapi tinjau ulang sebelum produksi. `xlsx` dan `pdf-parse` belum dipakai dan baru akan dipakai pada Fase 3.
- Rate limit better-auth memakai default library. Belum ada rate limit khusus untuk endpoint wrapper `/api/auth/login` dan `/api/auth/register`.
- Belum ada verifikasi email, reset password, dan manajemen sesi per perangkat.
- `classroom` diisi lewat seed/admin; belum ada UI pengelolaan.

## Fase Berikutnya

Fase 2 akan menambahkan manajemen pengguna/mata pelajaran dan CRUD bank soal sesuai pembagian fase proyek.
