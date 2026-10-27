# CBT App

Aplikasi Computer Based Test (CBT) untuk sekolah/kampus. Repository ini berada di **Fase 2**: fondasi auth/RBAC dari Fase 1 ditambah **Bank Soal CRUD** (5 tipe soal, filter, pencarian, soft-delete) dengan workspace guru yang juga bisa diakses ADMIN.

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

## Vendored UI

- `components/ui/form.tsx` dimodifikasi untuk mendukung RHF 7.91 + Zod transform. Jangan jalankan ulang `npx shadcn add form` tanpa re-apply patch.

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

## Bank Soal (Fase 2)

### Matriks akses

| Path | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| `/admin/*` | ✅ | 403 | 403 |
| `/teacher/*` | ✅ (super-user) | ✅ | 403 |
| `/student/*` | 403 | 403 | ✅ |
| `/dashboard` | → `/admin` | → `/teacher` | → `/student` |
| `/api/questions`, `/api/questions/[id]`, `/api/subjects` | ✅ | ✅ | 403 |

Middleware dan server guard sama-sama memakai union `["TEACHER", "ADMIN"]` untuk `/teacher/*`, sehingga ADMIN memakai route guru yang sama tanpa duplikasi halaman.

### Scope data

| Role | Daftar soal | Detail / ubah / hapus |
|---|---|---|
| TEACHER | `ownerId = user.id` | hanya miliknya (selain itu 404) |
| ADMIN | semua soal (termasuk milik guru lain) | semua soal |

`GET /api/questions/[id]` mengembalikan **404** (bukan 403) untuk soal milik guru lain atau soal yang sudah soft-delete, agar keberadaan soal tidak bocor.

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/questions` | Filter `subjectId`, `type`, `difficulty`, `search`, `page` (default 1), `pageSize` (default 20, max 100). Response `{ items, total, page, pageSize }`. |
| `POST` | `/api/questions` | Buat soal; `ownerId` diambil dari sesi. `201` + soal lengkap dengan opsi. |
| `GET` | `/api/questions/[id]` | Detail + opsi (diurutkan `order`). |
| `PATCH` | `/api/questions/[id]` | **Full replace** (bukan partial): seluruh field + opsi dikirim ulang. |
| `DELETE` | `/api/questions/[id]` | Soft-delete (`deletedAt = now()`). |
| `GET` | `/api/subjects` | `[{ id, name, code }]` untuk dropdown. Read-only. |

Semua endpoint memakai `requireRole(["TEACHER", "ADMIN"])`. Validasi body memakai `questionInputSchema`; error validasi → `400` dengan `errors` hasil `flatten().fieldErrors`.

### Validasi soal

`lib/zod-schemas/question.ts` adalah discriminated union berdasarkan `type` dan **strict** — field milik tipe lain ditolak (bukan di-strip diam-diam):

| Tipe | Payload jawaban | Aturan |
|---|---|---|
| `SINGLE_CHOICE` | `options[]` | min 2 opsi, tepat 1 `isCorrect` |
| `MULTIPLE_CHOICE` | `options[]` | min 2 opsi, minimal 1 `isCorrect` |
| `TRUE_FALSE` | `correctAnswer: boolean` | wajib |
| `SHORT_ANSWER` | `correctAnswers: string[]` | min 1, tidak boleh duplikat |
| `ESSAY` | — | tanpa kunci jawaban |

Semua tipe: `subjectId`, `questionText` (min 1), `explanation?`, `difficulty` (`EASY|MEDIUM|HARD`), `points` (int 1–1000). Label opsi wajib unik. Schema tidak mengimpor `@prisma/client`, sehingga aman dipakai di client component dan nanti di import Fase 3.

### Penyimpanan jawaban

Tabel `question_options` selalu menjadi representasi akhir, termasuk untuk tipe non-pilihan:

| Tipe | Baris `question_options` |
|---|---|
| `TRUE_FALSE` | `A = "Benar"` dan `B = "Salah"`, salah satu `isCorrect` (sama seperti seed) |
| `SHORT_ANSWER` | satu baris `KUNCI-1..n` per jawaban benar |
| `ESSAY` | tidak ada baris |

Halaman edit menormalkan kembali baris tersebut lewat `fromStoredOptions()`, jadi data seed lama (mis. `KUNCI` tunggal) tetap bisa diedit.

### Perilaku UI

- Halaman `/teacher/questions` dirender server (query Prisma langsung dengan scope yang sama seperti API). Filter disimpan di URL sehingga bisa di-bookmark.
- Search debounce 300ms dan mencakup `questionText` + `explanation` (case-insensitive).
- Form create/edit memakai React Hook Form + `zodResolver`. Mengganti tipe soal me-reset `options`, `correctAnswer`, dan `correctAnswers` sehingga tidak ada state nyangkut antar-tipe.
- Label opsi otomatis `A`–`E` (UI maksimal 5 opsi; schema menerima sampai 26 untuk kebutuhan impor).
- Hapus memakai `AlertDialog`, memanggil API lalu `router.refresh()`.

### Keputusan default

- **Mata pelajaran bersifat bersama.** TEACHER maupun ADMIN dapat memilih semua subject; kepemilikan soal tetap pada `ownerId` soal. CRUD subject baru ada di Fase 9.
- **PATCH = full replace.** Lebih sederhana dan aman untuk opsi: hapus opsi lama + buat opsi baru dalam satu `prisma.$transaction`, sehingga tidak bentrok dengan `@@unique([questionId, label])`.
- **ADMIN mengedit soal guru** tetap mempertahankan `ownerId` guru tersebut.
- **Soft-delete** dipilih agar soal yang sudah dipakai ujian tidak hilang; belum ada UI restore (lihat utang teknis).
- **`pageSize` maksimal 100** untuk mencegah query besar dari client.
- **Label opsi uppercase** agar konsisten dengan data seed.

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

Test memakai database pada `DATABASE_URL` dan membersihkan data `vitest-*@example.com` di `afterAll`.

`tests/questions.test.ts` menguji route handler Bank Soal secara langsung. `requireRole` asli tetap dijalankan; yang dimock hanya `next/headers` dan lookup sesi better-auth (`@/lib/auth`), sehingga kode `401/403` ikut teruji:

- TEACHER create `SINGLE_CHOICE` valid → `201`
- `SINGLE_CHOICE` 0 kunci → `400`
- `SINGLE_CHOICE` 2 kunci → `400`
- `MULTIPLE_CHOICE` 2 kunci → `201`
- `TRUE_FALSE` tanpa `correctAnswer` → `400`
- STUDENT `GET /api/questions` → `403`
- TEACHER soft-delete → hilang dari list + `GET` detail `404`; `deletedAt` terisi di database
- ADMIN melihat soal buatan TEACHER (scope filter)

Total **15 test** (7 auth + 8 questions). Test membuat user/subject sendiri dan menghapusnya di `afterAll`.

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

## Verifikasi Fase 2

Dijalankan pada Node 22.23.4 (npm 10.9.9):

- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos tanpa warning
- `npm test` → 15 test lolos (2 file)
- `npm run build` → lolos, 19 route + middleware
- `GET /teacher/questions` sebagai TEACHER → `200`, sidebar menampilkan "Bank Soal"
- `GET /teacher/questions` sebagai ADMIN → `200`
- `GET /teacher/questions` sebagai STUDENT → `307` → `/403`
- `GET /api/questions` sebagai STUDENT → `403`
- TEACHER membuat 5 soal (satu per tipe) → `201` semua, list `total: 5`
- Filter `type`/`difficulty` + search → hasil sesuai
- ADMIN melihat soal guru; TEACHER tidak melihat soal milik ADMIN (`total` berbeda)
- TEACHER `GET` soal milik ADMIN → `404`; ADMIN → `200`
- PATCH `TRUE_FALSE` → `SHORT_ANSWER` → opsi lama diganti menjadi `KUNCI-1`
- DELETE → hilang dari list, `GET` detail `404`, `psql` menunjukkan `deletedAt` terisi

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
    teacher/questions/
      page.tsx
      new/page.tsx
      [id]/edit/page.tsx
      _components/
        question-form.tsx
        filter-bar.tsx
        delete-dialog.tsx
    student/page.tsx
  403/page.tsx
  api/
    auth/
      [...all]/route.ts
      _shared.ts
      login/route.ts
      register/route.ts
    questions/
      _shared.ts
      route.ts
      [id]/route.ts
    subjects/route.ts
  globals.css
  layout.tsx
  page.tsx
  smoke/page.tsx
components/
  dashboard/{sidebar.tsx, user-menu.tsx}
  ui/{alert, alert-dialog, badge, button, card, dialog, dropdown-menu, form,
      input, label, select, table, textarea, toast, toaster}.tsx
hooks/
  use-toast.ts
lib/
  auth.ts
  auth-client.ts
  auth-helpers.ts
  prisma.ts
  roles.ts
  utils.ts
  questions/{answers.ts, labels.ts, query.ts}
  zod-schemas/{auth.ts, question.ts}
middleware.ts
tests/
  auth.test.ts
  questions.test.ts
  setup.ts
prisma/
  migrations/
  schema.prisma
  seed.ts
```

## Catatan Keamanan & Utang Teknis

- `npm audit` (production deps) mencatat: `xlsx` high tanpa fix tersedia, `zod` high yang perbaikannya butuh Zod v4 (breaking), serta advisory pada `next`, `prisma`, dan `vitest` yang hanya dapat diselesaikan dengan upgrade mayor. Belum ada yang dieksploitasi, tetapi tinjau ulang sebelum produksi. `xlsx` dan `pdf-parse` belum dipakai dan baru akan dipakai pada Fase 3.
- Rate limit better-auth memakai default library. Belum ada rate limit khusus untuk endpoint wrapper `/api/auth/login`, `/api/auth/register`, maupun endpoint Bank Soal.
- Belum ada verifikasi email, reset password, dan manajemen sesi per perangkat.
- `classroom` diisi lewat seed/admin; belum ada UI pengelolaan.
- Soft-delete Bank Soal belum punya UI restore/purge. Baris tetap tersimpan dan hanya difilter lewat `deletedAt`; sediakan job pembersihan atau halaman arsip sebelum produksi.
- ADMIN dapat mengubah/menghapus soal guru mana pun (super-user). Belum ada audit trail untuk perubahan soal.
- `@radix-ui/react-alert-dialog` ditambahkan khusus untuk konfirmasi hapus (komponen shadcn `alert-dialog`); tidak ada dependensi UI lain yang berubah.

## Fase Berikutnya

Fase 3 akan menambahkan impor bank soal dari DOCX/PDF/XLSX (`mammoth`, `pdf-parse@2.4.5`, `xlsx`) dengan schema `questionInputSchema` yang sama. Fase selanjutnya mencakup manajemen ujian, pelaksanaan CBT, penilaian, dan manajemen pengguna/mata pelajaran.
