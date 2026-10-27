# CBT App

Aplikasi Computer Based Test (CBT) untuk sekolah/kampus. Repository ini berada di **Fase 4**: fondasi auth/RBAC, **Bank Soal CRUD** (5 tipe soal, filter, pencarian, soft-delete), **import soal XLSX/DOCX/PDF** dengan preview sebelum commit, serta **export bank soal ke XLSX/PDF**. Workspace guru juga bisa diakses ADMIN.

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
| `SINGLE_CHOICE` / `MULTIPLE_CHOICE` | satu baris per opsi (`A`–`E`), `isCorrect` sesuai kunci |
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

## Import Soal (Fase 3)

Import tersedia untuk TEACHER dan ADMIN di `/teacher/questions/import`. Alurnya selalu **preview dulu, commit kemudian**. Tidak ada commit parsial: jika satu baris invalid, seluruh file harus diperbaiki dan diunggah ulang.

### Format XLSX

Sheet pertama bernama `questions` (jika tidak ada, sheet pertama dipakai). Baris 1 adalah header:

| Kolom | Wajib | Keterangan |
|---|---|---|
| `subject_code` | ya | Kode mapel yang sudah ada, mis. `MTK` |
| `type` | ya | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY` |
| `question` | ya | Teks soal |
| `option_a` … `option_e` | untuk pilihan ganda | Diisi berurutan mulai A; maksimal 5 opsi |
| `correct_answers` | sesuai tipe | Lihat tabel di bawah |
| `points` | tidak | Default `1`, harus bilangan bulat 1–1000 |
| `difficulty` | tidak | `EASY`, `MEDIUM`, `HARD`; default `MEDIUM` |
| `explanation` | tidak | Pembahasan |

Nilai `correct_answers`:

| Tipe | Format | Contoh |
|---|---|---|
| `SINGLE_CHOICE` | satu label | `B` |
| `MULTIPLE_CHOICE` | label dipisah koma | `A,C,D` |
| `TRUE_FALSE` | boolean | `true` / `false` |
| `SHORT_ANSWER` | dipisah pipa | 72 &#124; tujuh puluh dua |
| `ESSAY` | kosong | — |

Aturan tambahan XLSX:

- `TRUE_FALSE`, `SHORT_ANSWER`, dan `ESSAY` tidak boleh mengisi kolom opsi.
- `ESSAY` tidak boleh mengisi `correct_answers`.
- Label jawaban harus ada di opsi dan tidak boleh duplikat.
- Opsi harus berurutan; tidak boleh mengisi `option_c` tanpa `option_b`.
- Baris kosong sepenuhnya dilewati.

### Format DOCX/PDF

Satu file DOCX/PDF memakai **satu mata pelajaran** yang dipilih di form upload. Format blok:

```text
1. Ibu kota Indonesia adalah ...
   a. Bandung
   b. Jakarta
   c. Surabaya
   d. Medan
   Jawaban: B
   Pembahasan: Jakarta adalah ibu kota Indonesia.
   Poin: 2
   Tingkat: EASY

2. 7 adalah bilangan prima.
   Jawaban: true
   Pembahasan: 7 hanya habis dibagi 1 dan 7.
   Poin: 1
   Tingkat: MEDIUM
```

Metadata **case-insensitive**: `Tipe:`, `tipe:`, `TIPE:`; `Jawaban:`, `jawaban:`, `JAWABAN:`; begitu juga `Pembahasan:`, `Poin:`, dan `Tingkat:`.

Inferensi tipe:

| Kondisi | Tipe |
|---|---|
| `Tipe:` valid | Memakai nilai eksplisit |
| `Jawaban: true/false/benar/salah` | `TRUE_FALSE` |
| `Jawaban:` satu label opsi | `SINGLE_CHOICE` |
| `Jawaban:` beberapa label dipisah koma | `MULTIPLE_CHOICE` |
| `Tipe: SHORT_ANSWER` | `SHORT_ANSWER` |
| `Tipe: ESSAY` | `ESSAY` |
| Tanpa `Tipe:` dan tanpa `Jawaban:` | Error per soal |

`SHORT_ANSWER` di DOCX/PDF memakai **prioritas, bukan merge**:

1. Jika ada `Jawaban:` → gunakan hanya nilai pipe-separated.
2. Jika ada `Jawaban:` dan opsi `a-e` sekaligus → error “Kontradiksi: gunakan Jawaban: ATAU opsi a-e, tidak keduanya”.
3. Jika hanya ada opsi `a-e` → opsi dianggap variasi jawaban.
4. Jika keduanya kosong → error “SHORT_ANSWER harus punya Jawaban: atau opsi a-e”.

Untuk `ESSAY`, `Tipe: ESSAY` wajib karena tidak ada jawaban yang bisa dipakai untuk inferensi.

### Keamanan dan batas file

- Maksimal **10MB** dan **1.000 soal** per file.
- Ekstensi, MIME, dan magic bytes harus cocok:
  - XLSX/DOCX: ZIP (`PK`), MIME Open XML masing-masing;
  - PDF: `%PDF-`, MIME `application/pdf`.
- Nama file asli hanya disimpan untuk display. File di disk memakai `uploads/imports/<jobId>.<ext>` dengan nama acak dari id job.
- Tidak ada kolom path file di database. File dihapus setelah commit, delete, atau expiry.
- `PENDING_PREVIEW` kedaluwarsa setelah 1 jam. Expiry dicek lazy saat list/GET/commit; tidak ada cron di MVP.
- File upload tidak pernah disajikan sebagai file publik.
- Filesystem lokal dipakai untuk MVP. Jika deploy ke platform serverless dengan filesystem read-only, ganti `lib/importers/storage.ts` dengan object storage.

### Template dan regenerasi

Template tersedia di:

- `/templates/template-import-soal.xlsx`
- `/templates/template-import-soal.docx`
- `/templates/template-import-soal.pdf`

Regenerasi:

```bash
npm run templates:generate
```

Script `scripts/generate-templates.ts` membuat XLSX dengan SheetJS, lalu memakai LibreOffice (`libreoffice`/`soffice`) untuk DOCX dan PDF. LibreOffice harus tersedia di mesin yang menjalankan script; template hasil generate sudah di-commit sehingga build aplikasi tidak membutuhkan LibreOffice. Jika LibreOffice tidak tersedia, template dapat diregenerasi manual mengikuti format di atas; lihat git history commit `CBT-3-001`.

### Batasan parser

- PDF hanya text-based. PDF hasil scan/OCR akan ditolak dengan pesan “PDF tidak berisi teks”.
- DOCX/PDF memakai heuristic: nomor soal harus literal `1.`, opsi harus literal `a.`–`e.`. Auto-numbering Word tidak dijamin terbaca sebagai label.
- Satu file DOCX/PDF hanya untuk satu mapel. XLSX dapat mencampur beberapa `subject_code`.
- Format XLSX membatasi opsi sampai E. Schema API tetap menerima sampai 26 label untuk kebutuhan masa depan.
- `pdf-parse@2.4.5` dan `mammoth` diproses di server Node, bukan Edge Runtime.

## Export Soal (Fase 4)

Export tersedia untuk TEACHER dan ADMIN. Dropdown **Export** ada di filter bar halaman `/teacher/questions`; pilihannya **XLSX (.xlsx)** dan **PDF (.pdf)**. Export memakai filter yang sedang aktif di URL (`subjectId`, `type`, `difficulty`, `search`), sama seperti list — jadi hasil file selalu cocok dengan yang terlihat di layar.

### Endpoint

`GET /api/questions/export`

| Query | Wajib | Keterangan |
|---|---|---|
| `format` | ya | `xlsx` atau `pdf` |
| `subjectId` | tidak | Filter satu mata pelajaran |
| `type` | tidak | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY` |
| `difficulty` | tidak | `EASY`, `MEDIUM`, `HARD` |
| `search` | tidak | Pencarian teks soal/pembahasan (maks. 200 karakter) |

Response:

- `Content-Type`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) atau `application/pdf` (PDF).
- `Content-Disposition: attachment; filename="soal-<subject>-<YYYYMMDD-HHmmss>.xlsx|pdf"`. `<subject>` adalah kode mapel lowercase jika filter `subjectId` dipakai, atau `semua` tanpa filter mapel.
- Body berupa file biner; tidak ada pagination.
- RBAC: TEACHER dan ADMIN. TEACHER hanya mengekspor soal miliknya (`ownerId`), ADMIN seluruh bank soal.

### Format XLSX

File XLSX memakai sheet `questions` dan header yang **identik dengan template import Fase 3**, sehingga hasil export bisa langsung diunggah kembali ke fitur import (round-trip):

`subject_code | type | question | option_a | option_b | option_c | option_d | option_e | correct_answers | points | difficulty | explanation`

Pemetaan per tipe:

| Tipe | Kolom opsi | `correct_answers` |
|---|---|---|
| `SINGLE_CHOICE` | A–E sesuai urutan opsi | label jawaban, mis. `B` |
| `MULTIPLE_CHOICE` | A–E sesuai urutan opsi | label dipisah koma, mis. `A,C` |
| `TRUE_FALSE` | kosong | `true` / `false` |
| `SHORT_ANSWER` | kosong | variasi jawaban dipisah pipa, mis. `72\|tujuh puluh dua` |
| `ESSAY` | kosong | kosong |

Catatan penting:

- Label opsi ditulis ulang berdasarkan posisi kolom (A–E), bukan label tersimpan. Parser import memang membaca label dari posisi, sehingga data lama tetap round-trip.
- Template import menolak kolom opsi untuk `SHORT_ANSWER`. Karena itu variasi jawaban **hanya** ditulis di `correct_answers` (pipe-separated), bukan di `option_a`–`option_e`. Ini sedikit berbeda dari form input, tetapi diperlukan agar file hasil export benar-benar bisa di-re-import.
- Format XLSX membatasi opsi sampai E (sama dengan template import). Soal dengan lebih dari 5 opsi hanya mengekspor 5 opsi pertama; UI Bank Soal juga membatasi 5 opsi.
- `explanation` kosong ditulis sebagai sel kosong.

### Format PDF

PDF dibuat dengan `@react-pdf/renderer` (`renderToBuffer`) di server Node — tanpa Puppeteer/Playwright. Layout:

- A4, margin 40pt, font Helvetica bawaan.
- Header: judul **Bank Soal**, nama mapel (atau "Semua mata pelajaran"), nama user yang mengekspor, timestamp WIB, jumlah soal, dan total poin.
- Per soal: nomor, badge tipe, badge kesulitan, poin, teks soal (bold), opsi A–E (untuk pilihan ganda), kunci jawaban berwarna hijau, dan pembahasan bila ada.
- Footer: `Halaman X dari Y` di setiap halaman.

### Batas aman dan scope

- Export menolak lebih dari **2.000 soal** dengan `400` dan pesan `Filter terlalu luas, hasil melebihi 2000 soal. Persempit filter.` Hitung total dilakukan lebih dulu, jadi route tidak menarik seluruh hasil yang terlalu besar.
- Scope mengikuti `questionScopeWhere()`: TEACHER → `ownerId = user.id`; ADMIN → semua soal non-deleted.
- `EXPORT_MAX_QUESTIONS` dapat menurunkan batas ini untuk pengujian batas tanpa membuat 2.000+ baris. Default tetap `2000`.

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

`tests/import.test.ts` menguji preview dan commit import:

- XLSX valid 3 baris → 3 valid
- XLSX dengan 1 `type` invalid → 2 valid, 1 invalid
- XLSX `correct_answers` duplikat label → baris invalid
- DOCX valid 2 soal → 2 valid
- DOCX tanpa `Jawaban:` → error per soal
- PDF valid 1 soal → 1 valid
- PDF corrupt → global error
- Commit 50 soal valid → 50 soal dibuat, job `COMMITTED`, di bawah 30 detik
- Commit job bukan milik user → `404`
- Commit job yang sudah `COMMITTED` → `400`

Test memakai database pada `DATABASE_URL`, mengarahkan file import ke direktori temporary, dan membersihkan user/subject/question/import job di `afterAll`.

`tests/export.test.ts` menguji endpoint export XLSX/PDF:

- XLSX 5 soal → `200`, `Content-Type`/`Content-Disposition` benar, `XLSX.read()` menghasilkan 5 baris data
- XLSX round-trip → file di-parse ulang `parseXlsx()` menjadi 5 soal valid dengan tipe, opsi, kunci, poin, dan pembahasan yang sama
- PDF 5 soal → `200`, `application/pdf`, magic bytes `%PDF-`
- Filter `subjectId` → hanya soal mapel tersebut yang diekspor
- Scope filter → TEACHER hanya soal miliknya (2 baris), ADMIN semua (5 baris, termasuk milik guru lain)
- Safety cap (`EXPORT_MAX_QUESTIONS=5`) → export 6 soal mengembalikan `400` dengan pesan batas yang jelas

Test memakai user/subject khusus dan filter `search` berprefix unik, sehingga tidak terpengaruh data dari file test lain yang berjalan paralel.

Total **32 test** (7 auth + 9 questions + 10 import + 6 export).

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
- `npm test` → 16 test lolos (2 file)
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

## Verifikasi Fase 3

Dijalankan pada Node 22.23.4 (npm 10.9.9):

- `npx prisma validate` → schema valid
- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos
- `npm test` → **26 test** lolos (3 file)
- Commit 50 soal XLSX → 50 soal dibuat dalam **< 1 detik** pada local dev; transaction timeout 60 detik / `maxWait` 10 detik
- `npm run build` → lolos, 24 route + middleware
- `npm run templates:generate` → 3 template dibuat (LibreOffice)
- Upload template XLSX → preview 3 valid → commit 3 soal
- Upload template DOCX → preview 2 valid → commit 2 soal
- Upload template PDF → preview 2 valid → commit 2 soal
- Total setelah 3 import: 7 soal baru, 3 `import_jobs` berstatus `COMMITTED`, file upload terhapus
- File 20MB → `413`
- File teks dengan ekstensi/MIME PDF → `400` (magic bytes tidak cocok)
- Refresh `/teacher/questions/import/[jobId]` → `200`, preview dibaca dari `previewJson`
- STUDENT membuka `/teacher/questions/import` → `307` → `/403`
- `@napi-rs/canvas` → `canvas OK` (x64 Linux, glibc 2.43)

## Verifikasi Fase 4

Dijalankan pada Node 22-compatible runtime (mesin uji: Node 24.22.0, npm 11.19.1):

- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos tanpa warning
- `npm test` → **32 test** lolos (4 file)
- `npm run build` → lolos, 25 route + middleware; `/api/questions/export` terdaftar dinamis
- `curl` login TEACHER → export `format=xlsx&subjectId=<MTK>` → `200`, `attachment; filename="soal-mtk-<timestamp>.xlsx"`, `file` mendeteksi **Microsoft Excel 2007+**
- Export PDF filter MTK → `200`, `application/pdf`, `file` mendeteksi **PDF document, 3 halaman**, teks header/soal/kunci/pembahasan dan footer halaman terbaca
- Export XLSX tanpa filter mapel: TEACHER **13 baris** (12 MTK + 1 mapel lain miliknya), ADMIN **15 baris** (termasuk 2 soal guru lain) — scope berjalan
- Export XLSX filter MTK: 12 baris, semua `subject_code = MTK`
- Upload file XLSX hasil export (5 soal, 5 tipe) ke `/api/questions/import/preview` → `summary: { total: 5, valid: 5, invalid: 0 }` tanpa error baris
- Filter yang melebihi batas (diuji dengan `EXPORT_MAX_QUESTIONS=5`) → `400` + pesan `Filter terlalu luas...`

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
      import/
        page.tsx
        [jobId]/page.tsx
        _components/{upload-form.tsx, preview-table.tsx}
      _components/
        question-form.tsx
        filter-bar.tsx
        export-menu.tsx
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
      export/route.ts
      import/
        _shared.ts
        preview/route.ts
        commit/route.ts
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
  importers/{types.ts, validate.ts, blocks.ts, xlsx.ts, docx.ts, pdf.ts,
             index.ts, storage.ts, preview.ts, jobs.ts}
  exporters/{shared.ts, xlsx.ts, pdf.ts, pdf-document.tsx}
  questions/{answers.ts, labels.ts, query.ts}
  zod-schemas/{auth.ts, question.ts}
middleware.ts
public/
  templates/{template-import-soal.xlsx, .docx, .pdf}
scripts/
  generate-templates.ts
tests/
  auth.test.ts
  questions.test.ts
  import.test.ts
  export.test.ts
  fixtures/import/{valid.docx, invalid-no-answer.docx, valid.pdf, corrupt.pdf}
  setup.ts
prisma/
  migrations/
  schema.prisma
  seed.ts
```

## Known Issues & Tech Debt

### Import soal

- **`FAILED` vs `errorJson` punya semantik berbeda.** `status = FAILED` hanya dipakai saat parser gagal total (tidak ada baris terbaca dan `globalErrors` terisi); `errorJson` hanya menyimpan `globalErrors` tersebut. Error per baris disimpan di `previewJson.questions[].errors`, dan job tetap `PENDING_PREVIEW` meskipun semua baris invalid (`failedCount = summary.invalid`). Artinya `errorJson = null` bukan berarti file valid — klien harus memeriksa `status`, `summary`, dan error tiap baris.
- **Cleanup file upload saat server restart belum ada.** File di `uploads/imports/` hanya dihapus saat commit sukses, `DELETE` job, atau expiry lazy yang dipicu list/GET/commit milik user. Tidak ada startup sweep atau rekonsiliasi database ↔ filesystem. File orphan (mis. proses mati antara `saveImportFile()` dan update database, atau job yang tidak pernah dibuka lagi) bisa tertinggal. Sediakan job cleanup berkala sebelum produksi.
- **Belum ada test untuk `DELETE /api/questions/import/[id]`.** Route ini menghapus job milik user dan file upload-nya, termasuk kasus 404 untuk job milik user lain; perilaku tersebut belum tercakup `tests/import.test.ts`.
- **Belum ada test expiry TTL 1 jam.** `expireStaleImportJobs()` mengubah job `PENDING_PREVIEW` yang lebih tua dari `IMPORT_TTL_MS` menjadi `EXPIRED` dan menghapus filenya, tetapi belum diuji dengan fake timer/waktu termanipulasi.
- **Riwayat import dibatasi 10 di server, bukan di client.** `listRecentImportJobs(user.id)` memakai Prisma `take: 10`; UI hanya merender hasilnya. Tidak ada pagination, jadi job ke-11 dan seterusnya hanya bisa diakses lewat URL detail langsung.
- Commit 50 soal pada environment lokal selesai di bawah 1 detik; transaction timeout diset 60 detik dengan `maxWait` 10 detik sebagai batas aman.

### Export dan data soal

- **Fallback `fromStoredOptions()` untuk `TRUE_FALSE`.** Jika data korup (kedua opsi `isCorrect = false`, atau label/tulisan “Benar” tidak dikenali), fungsi jatuh ke `correctAnswer: true`. Ini membuat soal yang rusak tampak valid di form edit dan di export. Perbaiki dengan validasi data atau error eksplisit di Fase 9.
- **Opsi lebih dari E terpotong saat export XLSX.** Template import hanya menyediakan `option_a`–`option_e`. Soal lama dengan lebih dari 5 opsi akan kehilangan opsi ke-6 dan seterusnya; soal seperti itu juga tidak bisa round-trip penuh. UI Bank Soal membatasi 5 opsi, tetapi schema API masih menerima 26.
- **Export menahan seluruh hasil di memori.** XLSX memakai `XLSX.write()` dan PDF memakai `renderToBuffer()`; keduanya membangun buffer penuh sebelum response dikirim. Safety cap 2.000 soal membatasi risiko, tetapi export 2.000 soal PDF bisa lambat dan memakai memori besar. Streaming response/worker terpisah belum ada.
- **Soft-delete Bank Soal belum punya UI restore/purge.** Baris tetap tersimpan dan hanya difilter lewat `deletedAt`; sediakan job pembersihan atau halaman arsip sebelum produksi.
- **ADMIN dapat mengubah/menghapus soal guru mana pun (super-user).** Belum ada audit trail untuk perubahan soal.

### Dependensi dan tooling

- **`xlsx@0.18.5` high severity tanpa fix.** Advisory Prototype Pollution dan ReDoS pada SheetJS. Dipakai untuk import dan export; akses sudah dibatasi TEACHER/ADMIN, file import dibatasi 10MB, dan export dibatasi 2.000 soal. Jangan membuka upload ke pengguna anonim; tinjau ulang sebelum produksi.
- **`zod` high severity, perbaikan butuh Zod v4 (breaking).** Advisory memory exhaustion saat memvalidasi koleksi besar. Proyek masih di Zod 3.25; upgrade ke Zod 4 adalah perubahan mayor yang perlu migrasi schema dan error handling.
- **Edge middleware dan `jose`/`DecompressionStream`.** Middleware memakai `better-auth/cookies` dan rantai `jose`. Bergantung versi bundler, ini dapat memunculkan warning `DecompressionStream` (API Node yang tidak tersedia di Edge Runtime). Build lokal terakhir tidak menampilkan warning, tetapi middleware harus tetap Edge-safe: jangan menambahkan Prisma/Node API ke `middleware.ts`; verifikasi sesi otoritatif tetap di server component/route.
- **Advisory `next`/`prisma`/`vitest`.** `npm audit` mencatat advisory pada `next`/`postcss`, `@prisma/config`/`deepmerge-ts`, serta `vitest`/`tinypool`/`@vitest/mocker` (termasuk critical pada rantai tooling test). Perbaikannya memerlukan upgrade mayor (Next, Prisma, Vitest) dan belum dilakukan pada fase ini; sebagian besar berada di toolchain dev, bukan kode runtime.

### Lain-lain

- Rate limit better-auth memakai default library. Belum ada rate limit khusus untuk endpoint wrapper `/api/auth/login`, `/api/auth/register`, endpoint Bank Soal, maupun endpoint import/export.
- Import menyimpan file sementara di filesystem lokal (`uploads/imports`). Pastikan direktori tidak dapat diakses publik; ganti dengan object storage bila deploy ke platform serverless dengan filesystem read-only.
- Belum ada verifikasi email, reset password, dan manajemen sesi per perangkat.
- `classroom` diisi lewat seed/admin; belum ada UI pengelolaan.
- `@radix-ui/react-alert-dialog` ditambahkan khusus untuk konfirmasi hapus (komponen shadcn `alert-dialog`); tidak ada dependensi UI lain yang berubah.

## Fase Berikutnya

Fase 4 (export bank soal XLSX/PDF) selesai. Fase berikutnya mencakup manajemen ujian, pelaksanaan CBT, penilaian, serta manajemen pengguna/mata pelajaran.
