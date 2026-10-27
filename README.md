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

## Manajemen Ujian (Fase 5)

Manajemen ujian tersedia untuk TEACHER dan ADMIN di `/teacher/exams`. Alurnya: **buat draft → pilih soal → atur urutan/poin → publish → tutup**. Publish mengunci konten dan membuat snapshot permanen; edit/hapus hanya berlaku untuk draft.

### Matriks akses dan scope

| Path | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| `/teacher/exams`, `/teacher/exams/*` | ✅ (super-user) | ✅ | 403 |
| `/api/exams`, `/api/exams/*` | ✅ | ✅ | 403 |

| Role | Daftar ujian | Detail / ubah / publish / hapus |
|---|---|---|
| TEACHER | `ownerId = user.id` | hanya miliknya (selain itu 404) |
| ADMIN | semua ujian | semua ujian |

Picker soal memakai `GET /api/questions?subjectId=...`, sehingga scope soal tetap sama dengan Bank Soal: TEACHER hanya soal miliknya, ADMIN semua soal. TEACHER tidak dapat menyusun ujian dari soal guru lain.

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/exams` | Filter `status`, `subjectId`, `search`, `startFrom`, `startTo`, `page`, `pageSize` (max 100). Response `{ items, total, page, pageSize }`. |
| `POST` | `/api/exams` | Buat draft. `ownerId` dari sesi. `201` + detail. |
| `GET` | `/api/exams/[id]` | Detail + daftar soal + `totalPoints`. |
| `PATCH` | `/api/exams/[id]` | **Full replace** informasi dasar. Hanya DRAFT. |
| `PUT` | `/api/exams/[id]/questions` | Batch replace seluruh daftar soal. Hanya DRAFT. Urutan ditetapkan server dari index array. |
| `POST` | `/api/exams/[id]/publish` | DRAFT → PUBLISHED; validasi, snapshot, token. |
| `POST` | `/api/exams/[id]/close` | PUBLISHED → CLOSED. |
| `DELETE` | `/api/exams/[id]` | Hanya DRAFT; hard delete + cascade `exam_questions`. |

Semua route memakai `requireRole(["TEACHER", "ADMIN"])`. Error validasi memakai bentuk yang sama dengan Bank Soal (`{ message, errors }`); error publish yang menyangkut soal tertentu menambahkan `invalidQuestions`.

### Status

```text
DRAFT ──publish──> PUBLISHED ──close──> CLOSED (terminal)
  │
  └──hard delete──> (hilang)
```

- `PUBLISHED` dan `CLOSED` tidak dapat dihapus, termasuk setelah close. Histori attempt/nilai Fase 6–7 harus dilindungi.
- Tidak ada unpublish/reopen. Draft boleh diedit/dihapus; setelah publish konten immutable.
- `publishedAt` dan `closedAt` diisi saat transisi. Transisi memakai conditional `updateMany` untuk mencegah double publish/close; race → `409`.
- Menutup ujian tidak menghapus token; token tetap tersimpan untuk referensi.

### Snapshot publish (kontrak Fase 6/7)

`ExamQuestion.snapshotJson` awalnya `NULL` untuk draft dan **wajib terisi untuk status non-DRAFT**. Saat publish, setiap baris diisi:

```json
{
  "version": 1,
  "questionId": "...",
  "subjectId": "...",
  "type": "SINGLE_CHOICE",
  "questionText": "...",
  "explanation": "...",
  "difficulty": "EASY",
  "points": 2,
  "options": [
    { "label": "A", "text": "...", "isCorrect": false, "order": 1 },
    { "label": "B", "text": "...", "isCorrect": true, "order": 2 }
  ],
  "capturedAt": "2026-10-27T04:54:39.030Z",
  "sourceUpdatedAt": "2026-10-27T04:54:18.082Z"
}
```

Aturan yang mengikat Fase 6–8:

- Untuk `PUBLISHED`/`CLOSED`, **satu-satunya sumber kebenaran konten adalah snapshot**. Jangan membaca `Question`/`QuestionOption` live.
- Attempt Fase 6 harus FK ke `ExamQuestion.id`, bukan `Question.id`.
- Poin efektif = `pointsOverride ?? snapshot.points`.
- Kunci jawaban pilihan ganda memakai `label` (stabil), bukan `QuestionOption.id`. Short answer memakai `text` yang dinormalisasi.
- API siswa Fase 6 wajib memakai `toExamQuestionView(..., { forStudent: true })` untuk membuang `isCorrect` dan `explanation`.
- `parseExamSnapshot()` memvalidasi field wajib dan **mengabaikan unknown fields** (forward-compatible). Kalau snapshot invalid pada exam non-DRAFT, jangan fallback ke data live; itu data integrity error.
- `shuffleQuestions`/`shuffleOptions` hanya flag presentasi. Fase 6 harus menyimpan urutan/seed per attempt agar resume tidak mengubah urutan.
- `showResult` dibaca Fase 7 untuk menentukan visibilitas hasil.

Helper terkait ada di `lib/exams/snapshot.ts` (`buildExamSnapshot`, `parseExamSnapshot`, `snapshotAnswerIssues`, `toExamQuestionView`).

### Validasi publish

Publish ditolak (`400`) jika:

- tidak ada soal, atau lebih dari 200 soal;
- `startAt`/`endAt` kosong, `startAt >= endAt`, atau `endAt` sudah lewat;
- durasi di luar 1–480 menit;
- ada `questionId` null (soal di-hard-delete), soal soft-deleted, atau soal bukan dari mapel ujian;
- ada `pointsOverride` di luar 1–1000;
- kunci jawaban tidak valid menurut tipe: single choice tepat 1 kunci, multiple choice minimal 1, true/false tepat 2 opsi dan 1 kunci, short answer minimal 1 kunci non-kosong;
- duplikat `questionId`.

Snapshot dibangun di dalam transaksi yang sama dengan conditional `DRAFT → PUBLISHED`, sehingga publish yang gagal tidak meninggalkan status setengah jadi. Snapshot ditulis dengan `capturedAt` yang sama untuk seluruh soal.

### Token

- Draft: `token = NULL`, tidak pernah dikirim ke client.
- Publish: token 6 karakter dari alphabet `A–Z2–9` tanpa `I`, `O`, `0`, `1`; dibuat dengan `crypto.randomInt`.
- Kolom `token` unique; collision di-retry maksimal 5 kali.
- Token ditampilkan di detail (copy button), tidak di list, dan tidak di-log.
- Token bukan satu-satunya otorisasi: Fase 6 tetap harus cek status, jadwal, dan role.

### UI

- `/teacher/exams` — list, filter status/mapel/tanggal/search, pagination, status badge.
- `/teacher/exams/new` — informasi dasar saja; setelah dibuat redirect ke halaman edit.
- `/teacher/exams/[id]/edit` — informasi dasar + picker soal + reorder up/down/posisi + points override.
- `/teacher/exams/[id]` — detail, preview soal, token, publish/close/delete.
- Picker memakai dialog `max-w-4xl`, pencarian debounce 300ms, checkbox native, pagination 20 soal.
- Reorder memakai tombol naik/turun + input posisi (tanpa dnd-kit).
- Waktu diinput sebagai `datetime-local` WIB dan dikonversi ke ISO UTC; detail menampilkan WIB.
- Publish disabled jika belum ada soal / jadwal belum lengkap / jadwal sudah lewat. Server tetap memvalidasi ulang.
- Draft yang memiliki soal sudah dihapus menampilkan warning dan menyembunyikan baris yang tidak valid dari editor; simpan untuk membersihkannya.

### Keputusan default

- **Snapshot di JSONB per `ExamQuestion`**, bukan tabel snapshot terpisah. Satu baris = satu sumber konten immutable; tidak ada join tambahan.
- **Snapshot saat publish**, bukan saat memilih soal. Draft selalu mengikuti bank soal live; publish mengambil versi terbaru.
- **Batch PUT** untuk daftar soal. Draft belum punya attempt, jadi replace baris aman dan UI reorder menjadi sederhana.
- **Delete hanya draft**. Exam published/closed dipertahankan untuk histori.
- **`totalPoints` tidak disimpan**. Dihitung dari `pointsOverride ?? snapshot.points` saat detail dibaca.
- **Seed** menyertakan `demo-exam-1` berstatus DRAFT dengan 3 soal MTK untuk verifikasi manual.

## Pelaksanaan Ujian (Fase 6)

Siswa mengerjakan ujian di `/student/exams`. Alurnya: **login → gabung dengan token → kerjakan → autosave → submit → hasil**. Konten selalu dibaca dari snapshot `ExamQuestion.snapshotJson`, tidak pernah dari `Question`/`QuestionOption` live.

### Matriks akses

| Path | STUDENT | TEACHER / ADMIN |
|---|---|---|
| `/student/exams`, `/student/exams/*` | ✅ | 403 |
| `/api/attempts`, `/api/attempts/*` | ✅ (hanya attempt sendiri) | 403 |

`/api/*` tidak tercakup middleware, jadi setiap route attempt memanggil `requireRole(["STUDENT"])`. Attempt milik siswa lain selalu `404` (tidak membocorkan keberadaan).

### Status attempt

```text
IN_PROGRESS ──submit/expiry──> SUBMITTED (ada essay) ──Fase 7──> GRADED
     │
     └──submit/expiry tanpa essay──> GRADED
```

- `SUBMITTED` = sudah submit, masih menunggu penilaian essay.
- `GRADED` = semua soal objektif, atau essay sudah dinilai.
- `submittedAt` = `min(now, expiresAt)`.
- `receivedAt` = waktu server benar-benar menerima submit (audit).
- Tidak ada cron. Attempt `IN_PROGRESS` yang lewat `expiresAt` di-finalize secara lazy saat GET/join/submit/time.

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/attempts` | List attempt milik siswa + status; tanpa token/jawaban. |
| `POST` | `/api/attempts/join` | Body `{ token }`; normalize case-insensitive; create `201` atau resume `200`. |
| `GET` | `/api/attempts/[id]` | State lengkap untuk resume. `IN_PROGRESS` mengembalikan soal; status lain hanya ringkasan. |
| `PATCH` | `/api/attempts/[id]/answers/[examQuestionId]` | Autosave dengan `baseRevision` (optimistic concurrency). |
| `POST` | `/api/attempts/[id]/submit` | Finalize + auto-grade objektif; idempotent `200`. |
| `GET` | `/api/attempts/[id]/time` | `serverNow`, `expiresAt`, `remainingMs`, `status` untuk drift correction. |
| `GET` | `/api/attempts/[id]/result` | Hasil summary-only; `403` jika `showResult = false`. |

### Gate A — timer server-authoritative

- Join hanya jika `status = PUBLISHED` dan `startAt <= now < endAt`; exam DRAFT/CLOSED dan jadwal lewat tetap ditolak meski token valid.
- `expiresAt = min(startedAt + durationMinutes, exam.endAt)`. Contoh: durasi 90 menit, `endAt` 30 menit lagi → sisa efektif 30 menit.
- Autosave setelah `expiresAt` → `403`. Submit setelah `expiresAt` tetap diterima, tetapi `submittedAt` di-cap ke `expiresAt`; `receivedAt` menyimpan waktu aktual.
- Client hanya menampilkan timer. `serverNow` dari server dipakai untuk menghitung offset; polling `/time` tiap 60 detik dan saat tab kembali visible.
- Attempt existing dikembalikan lebih dulu (resume/result), bahkan jika jadwal sudah lewat atau exam CLOSED. Kebijakan: CLOSED memblokir join baru, tetapi attempt `IN_PROGRESS` tetap boleh lanjut sampai `expiresAt`.

### Gate B — autosave revision-safe

- `Answer.revision` mulai 1. Client mengirim `baseRevision`; server hanya update jika revisi cocok.
- `updateMany` atomik + `{ revision: { increment: 1 } }`. Stale → `200 { updated: false, reason: "stale", answer }`, bukan error, agar client tidak retry storm.
- Client men-serialisasi request per soal dan mengirim ulang jawaban terbaru setelah response. `baseRevision: 0` = belum ada Answer.
- Multi-answer **replace**, bukan merge. `["A","C"]` lalu `["C"]` menyimpan `["C"]`.
- Tidak memakai `clientTimestamp`; membandingkan clock client dengan `answeredAt` server rawan skew.

### Gate C — answer key tidak bocor

- Endpoint siswa memakai `toExamQuestionView(..., { forStudent: true })`, lalu memilih field aman saja (`examQuestionId`, `type`, `questionText`, `points`, `options`, `answer`).
- **`SHORT_ANSWER`/`ESSAY` selalu `options: []`.** Ini kritis: `forStudent: true` membuang `isCorrect`, tetapi pada `SHORT_ANSWER` teks kunci ada di `options[].text`.
- `explanation`, `questionId` bank, `subjectId`, `difficulty`, `sourceUpdatedAt`, `isCorrect`, `score` tidak pernah dikirim.
- Setelah submit, GET attempt tidak mengembalikan `questions` sama sekali.
- Gate test memakai string grep **dan** recursive traversal, plus test fixture-independent yang mengiterasi setiap teks opsi `SHORT_ANSWER`.

### Gate D — shuffle reproducible

- `shuffleQuestions` → `Attempt.questionOrder String[]` berisi `ExamQuestion.id`.
- `shuffleOptions` → `Attempt.optionOrder` map `ExamQuestion.id → label[]`.
- Fisher-Yates dengan `crypto.randomInt`; tidak ada re-shuffle saat GET.
- `TRUE_FALSE` tidak pernah di-shuffle.
- `questionOrder`/`optionOrder` divalidasi saat baca. Data korup → `500` eksplisit, bukan fallback silent.

### UI

- `/student/exams` — ujian aktif (info + status attempt) dan riwayat; tombol **Gabung ujian** membuka modal token.
- `/student/exams/[id]/take` — timer sticky, progress bar, navigasi soal, tanda ragu-ragu (client-only), autosave per soal, submit dengan konfirmasi.
- `/student/exams/[id]/result` — summary-only: skor, waktu submit, status menunggu penilaian. Tidak ada kunci jawaban.
- Komponen baru memakai native radio/checkbox dan `<div>` progress; tidak menambah dependency UI.

### Seed

`demo-exam-1` sekarang **PUBLISHED** dan berada dalam window aktif (`now - 1 jam` s/d `now + 2 jam`), token **`DEMO26`**, dengan 5 soal: single choice, multiple choice, true/false, short answer, dan essay. Re-run `npm run db:seed` akan mereset attempt demo untuk exam tersebut.

## Penilaian Essay (Fase 7)

Guru menilai jawaban esai di `/teacher/grading`. Attempt `SUBMITTED` muncul di daftar; guru membuka attempt, memberi nilai per esai, dan attempt otomatis menjadi `GRADED` saat essay terakhir dinilai. Semua konten soal dibaca dari `ExamQuestion.snapshotJson`, tidak pernah dari bank soal live.

### Matriks akses

| Path | STUDENT | TEACHER | ADMIN |
|---|---|---|---|
| `/teacher/grading`, `/teacher/grading/*` | 403 | ✅ exam miliknya | ✅ semua |
| `/api/grading`, `/api/grading/*` | 403 | ✅ exam miliknya | ✅ semua |

TEACHER yang mengakses exam guru lain mendapat `404` (bukan `403`) agar keberadaan exam tidak bocor. Exam `CLOSED` tetap dapat dinilai; status exam tidak menghalangi penilaian.

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/grading` | List attempt `SUBMITTED`; filter `examId`, `search` nama siswa, pagination. |
| `GET` | `/api/grading/[attemptId]` | Detail grading: essay, jawaban siswa, snapshot, explanation, ringkasan objektif. |
| `PUT` | `/api/grading/[attemptId]/essays/[examQuestionId]` | Body `{ score, baseRevision }`; nilai satu esai. |
| `PUT` | `/api/grading/[attemptId]/short-answers/[examQuestionId]` | Body `{ score, baseRevision }`; koreksi manual short answer. |

### Invariant dan state transition

- **Pending essay dihitung dari `ExamQuestion` bertipe `ESSAY`, bukan dari `Answer`.** Essay yang tidak dijawab siswa tidak punya baris `Answer`; tanpa aturan ini attempt akan stuck `SUBMITTED` selamanya.
- Saat guru menilai essay tanpa `Answer`, server membuat placeholder `Answer` dengan `textAnswer: null`, `selectedLabels: []`, `isCorrect: null`, `revision: 1`, dan **`answeredAt = attempt.submittedAt`** (bukan waktu guru menilai).
- `totalScore = sum(Answer.score)` untuk semua score non-null. `Answer` objektif dengan score null dianggap data rusak → `500` eksplisit.
- `SUBMITTED → GRADED` hanya terjadi jika semua `ExamQuestion` essay punya score non-null. Partial save tetap `SUBMITTED` dan total diperbarui sebagai nilai sementara.
- `Attempt.gradedAt` dan `Attempt.gradedById` di-set **sekali** saat transisi ke `GRADED`; regrade admin tidak mengubahnya.
- `Answer.gradedAt` dan `Answer.gradedById` diperbarui pada setiap save, termasuk regrade.
- `isCorrect` essay selalu `null`; nilai essay hanya direpresentasikan oleh `score`.
- `baseRevision` mengikuti semantik Fase 6. Revision conflict / attempt `GRADED` yang diubah TEACHER → `409`.

### Row lock dan konkurensi

`saveQuestionScore()` mengambil row lock `SELECT ... FOR UPDATE` pada `Attempt` di awal transaksi. Ini men-serialisasi penilaian per attempt sehingga dua essay terakhir yang disimpan bersamaan tidak sama-sama melihat state lama dan meninggalkan attempt `SUBMITTED`. Same-essay concurrency dilindungi `Answer.revision`.

### Gate

- **Gate 1 — snapshot-only:** `parseExamSnapshot(snapshotJson)` eksplisit; snapshot null/invalid → `500` dengan `examQuestionId`. Relasi `Question` live tidak pernah di-select.
- **Gate 2 — recompute:** total dari `Answer.score`; pending dari `ExamQuestion` essay; placeholder upsert; transisi hanya saat pending 0.
- **Gate 3 — scope/RBAC:** TEACHER hanya exam `ownerId` sendiri; ADMIN semua; STUDENT `403`; CLOSED tetap bisa dinilai.
- **Gate 4 — validasi:** score integer `0..effectivePoints` (`pointsOverride ?? snapshot.points`); negative/non-integer/>max → `400`.

### Lazy sweep

Dashboard memfinalisasi maksimal **25** attempt `IN_PROGRESS` yang sudah lewat `expiresAt` per request, lalu menampilkan attempt `SUBMITTED`. Sisa attempt diproses pada request berikutnya. Ini menutup gap Fase 6: attempt expired yang tidak pernah dibuka tetap bisa masuk daftar penilaian.

### UI

- `/teacher/grading` — tabel attempt menunggu nilai: siswa, ujian, waktu submit, badge terlambat, jumlah esai belum dinilai, nilai sementara. Jika lazy sweep terjadi, muncul toast “N attempt kedaluwarsa diselesaikan”.
- `/teacher/grading/[attemptId]` — daftar esai + jawaban siswa + pembahasan snapshot + input nilai; ringkasan objektif read-only; short answer dapat dikoreksi.
- Simpan esai terakhir memunculkan dialog konfirmasi karena akan mengunci nilai esai (`GRADED`).
- ADMIN dapat regrade esai; TEACHER read-only untuk esai setelah `GRADED`, tetapi tetap boleh mengoreksi short answer karena auto-grade-nya heuristik.

## Laporan & Export Hasil (Fase 8)

Guru/admin melihat rekap hasil ujian di `/teacher/reports`, lalu detail per ujian di `/teacher/reports/[examId]`. Laporan bersifat **read-only**: tidak menulis Attempt/Answer dan tidak menjalankan lazy sweep.

### Matriks akses

| Path | STUDENT | TEACHER | ADMIN |
|---|---|---|---|
| `/teacher/reports`, `/teacher/reports/*` | 403 | ✅ exam miliknya | ✅ semua |
| `/api/reports`, `/api/reports/*` | 403 | ✅ exam miliknya | ✅ semua |

TEACHER yang mengakses exam guru lain mendapat `404` (bukan `403`), konsisten Fase 5/7. Tanpa session → `401`.

### Endpoint

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/reports` | List exam yang punya ≥1 attempt; filter `status`, `subjectId`, `search` judul, `startFrom`/`startTo` (`Exam.startAt`), pagination. |
| `GET` | `/api/reports/[examId]` | Detail: metadata exam, statistik, histogram, daftar kelas, tabel attempt. Filter `classroom`, `status`, `search` nama siswa, pagination. |
| `GET` | `/api/reports/[examId]/export?format=xlsx\|pdf` | Unduh laporan; mengikuti filter aktif (`classroom`, `status`, `search`). |

Contoh payload detail:

```json
{
  "exam": { "id": "...", "title": "...", "token": "DEMO26", "owner": { "id": "...", "name": "Guru Demo" } },
  "stats": {
    "totalAttempts": 7,
    "byStatus": { "inProgress": 1, "submitted": 1, "graded": 5 },
    "graded": { "count": 5, "avgScore": 54, "minScore": 0, "maxScore": 100, "avgPercentage": 54 },
    "histogram": [
      { "bin": 1, "label": "0–20%", "min": 0, "max": 20, "count": 2 },
      { "bin": 2, "label": "21–40%", "min": 21, "max": 40, "count": 0 },
      { "bin": 3, "label": "41–60%", "min": 41, "max": 60, "count": 1 },
      { "bin": 4, "label": "61–80%", "min": 61, "max": 80, "count": 0 },
      { "bin": 5, "label": "81–100%", "min": 81, "max": 100, "count": 2 }
    ],
    "histogramTotal": 5,
    "invalidScores": 0
  },
  "classrooms": ["XII IPA 1", "XII IPS 2"],
  "attempts": { "items": [], "total": 7, "page": 1, "pageSize": 20 }
}
```

### Agregasi

- Counter `IN_PROGRESS`/`SUBMITTED`/`GRADED` dihitung dari `Attempt.status`.
- `avg`/`min`/`max` **hanya** dari `GRADED`; attempt yang belum selesai/dinilai tidak menurunkan rata-rata.
- Histogram 5 bin dengan **batas atas inklusif**: `bin = clamp(ceil(pct / 20) - 1, 0, 4) + 1`. Artinya 0% dan 20% masuk bin 1, 50% masuk bin 3, 100% masuk bin 5.
- `histogramTotal` wajib sama dengan `stats.graded.count`. `invalidScores` menampung GRADED dengan `totalScore` null atau `maxScore <= 0`.
- `avgPercentage = avg(totalScore) / maxScore` (maxScore seragam per exam karena snapshot immutable).
- Agregasi memakai SQL: `prisma.attempt.groupBy` untuk counter/avg/min/max, dan satu `$queryRaw` untuk bin histogram. **Tidak ada loop per-attempt** dan tidak ada query `Answer` sama sekali.
- List exam memakai satu `groupBy` untuk seluruh halaman (≤100 exam), bukan query per exam.
- `classroom = null` dikelompokkan sebagai "Tanpa Kelas"; filter memakai sentinel `__none__`.
- Late badge memakai `isLateSubmission` dari `lib/grading/late.ts` (satu definisi dengan Fase 7): `receivedAt - submittedAt > 60 detik`.

### Export

Sheet XLSX `results`, header tetap:

| No | Nama Siswa | Kelas | Mulai | Submit | Status | Late | Total | Max | Persentase (%) | Graded At | Graded By |
|---|---|---|---|---|---|---|---|---|---|---|---|

- `Late` = index 6, `Total` = index 7, `Max` = index 8, `Persentase (%)` = index 9.
- `Total`/`Max`/`Persentase` ditulis **numerik**; sel yang belum ada nilainya dikosongkan (`""`) agar tipe kolom tidak berubah.
- PDF memakai `@react-pdf/renderer`, **A4 landscape**, berisi header exam, ringkasan, tabel dengan header berulang di setiap halaman, dan footer `Halaman n dari m`.
- Nama file: `hasil-<kode-mapel>-<YYYYMMDD-HHmmss>.<ext>`.
- Batas: XLSX **2000** attempt (`EXPORT_MAX_ATTEMPTS`), PDF **500** attempt (`EXPORT_MAX_PDF_ATTEMPTS`). Melebihi batas → `400` dengan saran mempersempit filter; PDF menambahkan hint memakai XLSX.
- `fileResponse` dipindah ke `lib/exporters/shared.ts` dan dipakai bersama oleh export Bank Soal (Fase 4) dan laporan (Fase 8).
- Export tidak menyertakan token, `snapshotJson`, `questionOrder`, `optionOrder`, maupun data `Answer`.

### UI

- `/teacher/reports` — list exam yang punya attempt: counter per status, rata-rata, filter mapel/status/tanggal/search, pagination.
- `/teacher/reports/[examId]` — kartu statistik, histogram, ringkasan, filter kelas/status/nama, tabel attempt, tombol export, pagination.
- Aksi "Lihat" hanya untuk attempt `SUBMITTED`/`GRADED` dan menuju `/teacher/grading/[attemptId]` (Fase 7). Attempt `IN_PROGRESS` ditandai "Belum selesai".
- Token ditampilkan di detail (guru/admin) dan sengaja tidak muncul di list/export.
- Tombol export mencantumkan jumlah attempt pada tooltip dan hint "PDF maks 500 baris; gunakan XLSX untuk data lengkap."

### Keputusan default dan tech debt

- **Tanpa KKM/passing grade.** KKM biasanya milik mapel/kelas, bukan exam; perlu kolom baru dan UI pengaturan.
- **Tanpa analisis per soal** (difficulty/discrimination index) → Fase 9.
- **Tanpa lazy sweep di laporan.** Attempt `IN_PROGRESS` yang sudah lewat expiry tetap tampil apa adanya sampai ada request grading/submit yang menyelesaikannya.
- `showResult = false` tidak memblokir laporan guru; kebijakan itu hanya untuk tampilan siswa.
- Tabel attempt tidak pernah men-select `Answer`, `snapshotJson`, atau kolom order; payload hanya metadata + skor.

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

`tests/exams.test.ts` menguji manajemen ujian secara langsung, termasuk tiga gate Fase 5:

- create valid → `201` DRAFT, owner benar, token null
- durasi 0/481, jadwal terbalik, subject tidak ada → `400`
- PATCH draft → `200`; PATCH published → `400`; ganti mapel saat ada soal → `400`
- PUT questions menyimpan urutan + `pointsOverride`; duplikat/soft-deleted/mapel lain/>200 soal → `400`
- publish tanpa soal/jadwal/soal soft-deleted/kunci invalid → `400`
- publish valid → PUBLISHED + token 6 karakter + `publishedAt` + snapshot JSON terisi
- publish ulang → `400`
- **Gate immutability:** edit soal bank setelah publish → GET tetap snapshot lama
- **Gate immutability:** hard-delete soal setelah publish → snapshot utuh, `questionId` null
- close draft/published/closed dan delete draft/published/closed sesuai state machine
- student `GET /api/exams` → `403`; teacher exam guru lain → `404`; admin → `200`
- list scope/filter status/subject/search; `totalPoints` = override + default
- **Gate answer-key isolation:** `toExamQuestionView(forStudent: true)` tidak mengembalikan `isCorrect`/`explanation`
- **Gate snapshot versioning:** `parseExamSnapshot` menerima unknown fields dan membuangnya
- token generator: 1.000 token unik, panjang 6, alphabet aman

Test memakai user/subject khusus, judul berprefix unik, dan cleanup `afterAll`, sehingga aman terhadap parallel test file lain.

`tests/attempts.test.ts` menguji Fase 6 secara langsung, termasuk empat gate:

- **Gate A (A1–A11):** join window, `expiresAt = min(...)`, join sebelum/sesudah jadwal, DRAFT/CLOSED, autosave setelah expiry `403`, submit setelah expiry dengan `submittedAt` cap, `receivedAt` audit, serta `/time`.
- **Gate B (B1–B6):** create/update revision, stale `200`, `baseRevision: 0` saat Answer sudah ada, multi-answer replace, label/payload invalid `400`.
- **Gate C (C1–C9):** tidak ada `isCorrect`/`explanation`/`correctAnswers`/`score`; recursive traversal; `SHORT_ANSWER`/`ESSAY` `options: []`; teks kunci short answer tidak muncul; teacher endpoint tetap punya kunci; setelah submit tidak ada `questions`.
- **Gate D (D1–D7):** `questionOrder`/`optionOrder` persisten, GET 2× identik, `TRUE_FALSE` tidak di-shuffle, unit test Fisher-Yates, dan data korup → `500` eksplisit.
- **Functional:** token case-insensitive, double join idempotent, ownership `404`, TEACHER `403`, resume, list scope, result gating, concurrent lazy-finalize + submit, grading semua tipe, essay `SUBMITTED`, double submit idempotent, serta pure helper grading.

Test memakai fixture unik dan cleanup berurutan `answers → attempts → examQuestions → exams → questions → subjects → users` karena FK `Restrict`. Cleanup diverifikasi dengan assertion jumlah attempt = 0.

`tests/grading.test.ts` menguji Fase 7 secara langsung, termasuk empat gate:

- **Gate 1 (G1.1–G1.5):** grading membaca snapshot setelah bank soal diubah; snapshot null/invalid → `500` eksplisit dengan `examQuestionId`; `pointsOverride` membatasi score dan `maxScore`; score objektif null → `500` integrity.
- **Gate 2 (G2.1–G2.11):** partial save tetap `SUBMITTED`; esai terakhir → `GRADED`; essay kosong membuat placeholder dengan `answeredAt = submittedAt` (#27); semua esai 0 → `GRADED`; idempotensi/revision; invariant total; objek/unknown/foreign essay; active attempt `409` dan expired lazy-finalize; **dua essay berbeda concurrent → `GRADED`**; **same essay concurrent → satu `409`**; `isCorrect` essay tetap null dan teks siswa tidak berubah.
- **Gate 3 (G3.1–G3.9):** list scope + badge terlambat + exclusion `GRADED`; guru menilai attempt siswa lain pada exam miliknya; exam guru lain `404`; admin semua; student `403`; exam `CLOSED` tetap bisa dinilai; teacher regrade `409`; **admin regrade mengubah `Answer.gradedAt/By` tetapi tidak `Attempt.gradedAt/By`** (#28).
- **Gate 4:** validasi score >max/negatif/non-integer/string/missing; score 0 dan max diterima; detail guru memuat kunci/explanation; hasil siswa tetap tidak membocorkan kunci; **#30 short answer override oleh TEACHER setelah `GRADED` — `Attempt.gradedAt/gradedById` tetap, `Answer.gradedAt` diperbarui, `Answer.gradedById = teacher`, total recomputed**.
- **Lazy sweep (#29):** 30 attempt expired → request pertama memfinalisasi tepat 25, request kedua 5, sisa `IN_PROGRESS = 0`.

`tests/reports.test.ts` menguji laporan Fase 8, termasuk empat gate:

- **Gate 1 (R1–R6):** avg/min/max hanya GRADED; histogram 0/50/100% → `[1,0,1,0,1]`; batas bin inklusif 20/40/60/80/100 → `[1,1,1,1,1]`; satu GRADED; exam kosong → `200`; list hanya exam yang punya attempt dengan counter per status.
- **Gate 2 (R7–R12):** TEACHER B → `404` (detail + export); ADMIN → `200`; STUDENT → `403` (list/detail/export); tanpa session → `401`; list TEACHER hanya exam miliknya, ADMIN semua.
- **Gate 4 (R13–R15):** payload tidak memuat `isCorrect`, `explanation`, `snapshotJson`, `questionOrder`, `optionOrder`, `answers`, `questionId`, `selectedLabels`, `textAnswer`; token hanya di detail.
- **Gate 5 (R16–R21):** filter classroom, sentinel `__none__`, search nama case-insensitive + status, date range + search judul, pagination, late badge (di atas/di tepat threshold/belum submit).
- **R30:** regression guard hasil refactor — `LATE_SUBMISSION_THRESHOLD_MS` tetap 60.000 ms, `isLateSubmission` dan `fileResponse` berperilaku sama.

`tests/report-export.test.ts` menguji integritas export:

- XLSX 10 GRADED → 10 baris data + header tetap; `Late` index 6, `Total` index 7; `Total`/`Max`/`Persentase` numerik.
- Exam kosong → `200` dengan header saja.
- Round-trip `XLSX.read()` → sheet `results`, nilai baris valid.
- PDF → `%PDF-`, `application/pdf`, A4 landscape, teks exam/siswa terbaca (`pdf-parse`).
- Cap export (`EXPORT_MAX_ATTEMPTS`/`EXPORT_MAX_PDF_ATTEMPTS`) → `400` dengan pesan jelas.
- Filter `classroom` ikut terbawa ke export (hanya baris kelas tersebut).

Total **168 test** (7 auth + 9 questions + 10 import + 6 export + 34 exams + 44 attempts + 29 grading + 22 reports + 7 report-export).

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

## Verifikasi Fase 5

Dijalankan pada Node 24.22.0 (npm 11.19.1):

- `npx prisma validate` → schema valid
- `npx prisma migrate dev --name add_exam_management` → migration `20261027044726_add_exam_management` diterapkan
- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos tanpa warning
- `npm test` → **66 test** lolos (5 file)
- `npm run build` → lolos, **32 route** + middleware; seluruh route `/api/exams/*` dan halaman `/teacher/exams/*` terdaftar dinamis
- `npm run db:seed` → membuat `demo-exam-1` DRAFT dengan 3 soal MTK
- `curl` login TEACHER → `POST /api/exams` → `DRAFT`; `PUT /questions` (3 soal, satu `pointsOverride: 4`) → `DRAFT`; `POST /publish` → `PUBLISHED`, token **`4P56D5`**, `publishedAt` terisi, `totalPoints = 6`
- Setelah publish, `PATCH /api/questions/demo-q1` mengubah teks soal bank; `GET /api/exams/<id>` tetap mengembalikan teks snapshot lama dan `source: "snapshot"`
- `psql`:
  - `SELECT id, status, token, "publishedAt" FROM exams` → `PUBLISHED | 4P56D5`
  - `SELECT "examId", "questionId", "pointsOverride", jsonb_typeof("snapshotJson") FROM exam_questions` → 3 baris, semuanya `object`, `demo-q2` memiliki `pointsOverride = 4`
  - `jsonb_pretty("snapshotJson")` menampilkan `version: 1`, `questionText`, `options[].isCorrect`, `capturedAt`, `sourceUpdatedAt`
- Gate answer-key isolation diverifikasi di `tests/exams.test.ts`: `toExamQuestionView(forStudent: true)` tidak memiliki `explanation` dan tidak ada `isCorrect` pada opsi
- Gate snapshot versioning diverifikasi: `parseExamSnapshot({ ...snapshot, extraField: "future-data" })` tetap valid dan membuang `extraField`

## Verifikasi Fase 6

Dijalankan pada Node 24-compatible runtime:

- `npx prisma migrate dev --name add_exam_attempts` → migration `20261027072159_add_exam_attempts` diterapkan
- `npx tsc --noEmit` → lolos
- `npm run lint` → lolos tanpa warning
- `npm test` → **110 test** lolos (6 file)
- `npm run build` → lolos; route `/student/exams`, `/student/exams/[id]/take`, `/student/exams/[id]/result`, dan seluruh `/api/attempts/*` terdaftar dinamis
- `npm run db:seed` → `demo-exam-1` PUBLISHED, token `DEMO26`, 5 soal (single, multi, true/false, short, essay), snapshot JSON terisi
- `curl` login STUDENT → `POST /api/attempts/join` token `" demo26 "` → `201 IN_PROGRESS`
- `curl` GET attempt → `maxScore = 10`, 5 soal, `SHORT_ANSWER.options = []`, `ESSAY.options = []`
- `curl` PATCH 5 jawaban → semua `updated: true`, `revision: 1`; GET ulang → jawaban/urutan/`expiresAt` sama
- String grep payload siswa: `isCorrect` = 0 match, `explanation` = 0 match; teks kunci short answer `"72"` tidak muncul pada payload yang belum dijawab
- `psql` `attempts.questionOrder` berisi 5 `ExamQuestion.id`; `optionOrder` hanya berisi 2 soal pilihan (TRUE_FALSE tidak di-shuffle)
- Gate A10 via `curl`: `expiresAt` dimundurkan 5 menit → submit `200`, `submittedAt = 2026-10-27T07:26:04.201Z`, `receivedAt = 2026-10-27T07:31:04.293Z`, `receivedAt > submittedAt = true`
- Result endpoint → `SUBMITTED`, `totalScore: null`, pesan “Menunggu penilaian essay oleh guru.”

## Verifikasi Fase 7

Dijalankan pada runtime Node 24-compatible:

- `npx prisma migrate dev --name add_grading_audit` → migration `20261027080036_add_grading_audit` diterapkan (`Answer.gradedAt`, `Answer.gradedById`, `Attempt.gradedById`, index)
- `npm run typecheck` → lolos
- `npm run lint` → lolos tanpa warning
- `npx vitest run --reporter=verbose` → **139 test** lolos (7 file)
- `npm run build` → lolos; route `/teacher/grading`, `/teacher/grading/[attemptId]`, dan seluruh `/api/grading/*` terdaftar
- `curl` student join + submit exam 2 essay (1 tidak dijawab) → `SUBMITTED`, `totalScore: null`
- `curl` teacher GET `/api/grading/[attemptId]` → 2 essay, `pendingEssayCount: 2`, essay kosong `answer: null`
- `curl` teacher PUT esai 1 score 3 → `SUBMITTED`, `totalScore: 3`, `pendingEssayCount: 1`
- `curl` teacher PUT esai kosong score 0 (`baseRevision: 0`) → `GRADED`, `totalScore: 3`, `pendingEssayCount: 0`, `gradedAt` terisi
- `psql` placeholder Answer → `answeredAt = submittedAt = 2026-10-27 08:07:54.02`, `score = 0`, `isCorrect = NULL`
- `curl` teacher regrade setelah `GRADED` → `409`; admin PUT score 5 → `200`, `totalScore: 5`, `Attempt.gradedAt` tetap, `Answer.gradedAt` berubah, `Answer.gradedById = admin`
- **Gate 1:** PATCH bank soal live (`questionText`, `explanation`, `points = 99`) setelah publish → GET grading tetap snapshot (`points: 3`, teks lama); `psql` menunjukkan `live_text != snapshot_text`, `live_points = 99`, `snapshot_points = 3`
- **Gate 2 race:** `G2.9` dua essay concurrent → `GRADED`, total 7, `gradedAt` sekali; `G2.10` same essay concurrent → status `[200, 409]`, revision konsisten
- **Lazy sweep:** `#29` 30 expired `IN_PROGRESS` → request pertama `swept: 25`, sisa 5; request kedua `swept: 5`, sisa 0

## Verifikasi Fase 8

- `git diff prisma/schema.prisma` → kosong; **tidak ada migration** (pure aggregation).
- Refactor R1–R3: `fileResponse` → `lib/exporters/shared.ts`, `isLateSubmission` → `lib/grading/late.ts`, `AttemptStatusBadge` → `components/attempts/`.
- `npx vitest run tests/export.test.ts` → **6 lolos**; `npx vitest run tests/grading.test.ts` → **29 lolos** (tidak ada regresi).
- `npx vitest run --reporter=verbose` → **168 test lolos** (9 file).
- `npx tsc --noEmit` → lolos; `npx eslint .` → 0 error/0 warning; `npm run build` → lolos (`/teacher/reports`, `/teacher/reports/[examId]`, `/api/reports`, `/api/reports/[examId]`, `/api/reports/[examId]/export` terdaftar).
- `curl` teacher `GET /api/reports?search=...` → exam dengan 10 attempt (`graded: 10`, `avgScore: 45`).
- `curl` detail demo exam (5 GRADED skor 0/20/50/100/100 + 1 SUBMITTED + 1 IN_PROGRESS) → `totalAttempts: 7`, `avg: 54`, histogram `[2,0,1,0,2]` (0% dan 20% sama-sama bin 1), `histogramTotal: 5`, `invalidScores: 0`.
- `curl` export XLSX exam 10 attempt → `200`, 10 baris data, header `Late`=6/`Total`=7, `Total`/`Max`/`Persentase` bertipe number.
- `curl` export PDF → `200`, `%PDF-`, `application/pdf`, 1 halaman A4 landscape (841.89 × 595.28), teks exam/summary/footer terbaca.
- `curl` exam kosong → detail `200` dengan counter 0 dan histogram nol; export XLSX `200` dengan header saja (1 baris).
- `curl` filter `classroom=XII IPA 1` → 6 attempt; export dengan filter yang sama → 6 baris data, hanya kelas tersebut.
- Scope: teacher → exam milik admin `404` (detail + export); admin → exam guru `200` (detail + export); student → `403` (list/detail/export); tanpa session → `401`.
- Gate 4: grep payload detail → `isCorrect` 0, `explanation` 0, `snapshotJson` 0, `questionOrder` 0, `optionOrder` 0, `"answers"` 0; token 0 match di payload list.
- Fixture verifikasi dihapus kembali (`attempts/exams/users`), `demo-exam-1` kembali 0 attempt.

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
    teacher/exams/
      page.tsx
      new/page.tsx
      [id]/page.tsx
      [id]/edit/page.tsx
      _components/{exam-form.tsx, exam-filter-bar.tsx, exam-actions.tsx,
                  question-picker-dialog.tsx, token-card.tsx,
                  delete-exam-dialog.tsx, status-badge.tsx, types.ts}
    teacher/grading/
      page.tsx
      [attemptId]/page.tsx
      _components/{grading-filter-bar.tsx, score-form.tsx,
                  swept-attempts-toast.tsx}
    teacher/reports/
      page.tsx
      _components/report-filter-bar.tsx
      [examId]/page.tsx
      [examId]/_components/{report-attempts-filter-bar.tsx,
                          score-histogram.tsx, export-buttons.tsx}
    student/
      page.tsx
      exams/
        page.tsx
        [id]/take/page.tsx
        [id]/result/page.tsx
        _components/{join-exam-dialog.tsx, take-exam-client.tsx}
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
    exams/
      _shared.ts
      route.ts
      [id]/route.ts
      [id]/questions/route.ts
      [id]/publish/route.ts
      [id]/close/route.ts
    attempts/
      _shared.ts
      route.ts
      join/route.ts
      [id]/route.ts
      [id]/answers/[examQuestionId]/route.ts
      [id]/submit/route.ts
      [id]/time/route.ts
      [id]/result/route.ts
    grading/
      _shared.ts
      _score.ts
      route.ts
      [attemptId]/route.ts
      [attemptId]/essays/[examQuestionId]/route.ts
      [attemptId]/short-answers/[examQuestionId]/route.ts
    reports/
      _shared.ts
      route.ts
      [examId]/route.ts
      [examId]/export/route.ts
    subjects/route.ts
  globals.css
  layout.tsx
  page.tsx
  smoke/page.tsx
components/
  attempts/attempt-status-badge.tsx
  dashboard/{sidebar.tsx, user-menu.tsx}
  ui/{alert, alert-dialog, badge, button, card, dialog, dropdown-menu, form,
      input, label, select, table, textarea, toast, toaster}.tsx
hooks/
  use-toast.ts
lib/
  api.ts
  auth.ts
  auth-client.ts
  auth-helpers.ts
  prisma.ts
  roles.ts
  utils.ts
  importers/{types.ts, validate.ts, blocks.ts, xlsx.ts, docx.ts, pdf.ts,
             index.ts, storage.ts, preview.ts, jobs.ts}
  exporters/{shared.ts, xlsx.ts, pdf.ts, pdf-document.tsx,
             report-xlsx.ts, report-pdf.ts, report-pdf-document.tsx}
  questions/{answers.ts, labels.ts, query.ts}
  exams/{datetime.ts, labels.ts, query.ts, snapshot.ts, token.ts}
  attempts/{time.ts, shuffle.ts, grade.ts, payload.ts, service.ts}
  grading/{constants.ts, late.ts, types.ts, recompute.ts, snapshot.ts,
            query.ts, service.ts}
  reports/{types.ts, labels.ts, stats.ts, query.ts}
  zod-schemas/{auth.ts, attempt.ts, exam.ts, question.ts, grading.ts,
               report.ts}
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
  exams.test.ts
  attempts.test.ts
  grading.test.ts
  reports.test.ts
  report-export.test.ts
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

### Manajemen ujian

- **Tidak ada clone/duplikat ujian.** Salah ketik judul atau jadwal setelah publish tidak bisa diperbaiki; guru harus membuat ujian baru dari nol. Pertimbangkan fitur duplikat di Fase 9.
- **Tidak ada unpublish (PUBLISHED → DRAFT).** Setelah publish, konten dan metadata ujian immutable. Ini disengaja untuk integritas snapshot, tetapi konsekuensinya typo setelah publish tidak bisa diperbaiki.
- **Tidak ada audit trail aktor.** `publishedAt`/`closedAt` hanya menyimpan waktu, bukan **siapa** yang melakukan publish/close. Tambahkan audit log sebelum produksi.
- **Token tidak bisa di-regenerate/revoke.** Token tetap tersimpan setelah ujian ditutup. Kalau token bocor, belum ada tombol membuat token baru atau mencabut token lama.
- **Tidak ada rate limit khusus endpoint exam/publish.** Akses tetap dibatasi TEACHER/ADMIN, tetapi percobaan create/publish/publish-retry (termasuk retry token collision) belum dibatasi.
- **Pencarian judul memakai `contains`/ILIKE tanpa index.** `GET /api/exams?search=` memakai `contains` case-insensitive pada `exams.title`; B-tree tidak membantu pola `%...%`. Untuk data besar, tambahkan `pg_trgm` + GIN index pada `title`.
- **Snapshot JSON tidak diindeks untuk pencarian.** Report Fase 8 sebaiknya membaca attempt/answer, bukan melakukan query teks ke `snapshotJson`. Kalau perlu, tambahkan GIN index pada kolom JSONB.
- **Response detail memuat seluruh soal.** Batas 200 soal × teks maksimal 20.000 karakter bisa menghasilkan response beberapa MB (worst case ~4 MB) sebelum JSON overhead. Preview bertahap/pagination atau endpoint preview terpisah bisa ditambahkan bila diperlukan.
- **Zona waktu UI diasumsikan WIB (UTC+7).** Server menyimpan UTC; label dan konversi `datetime-local` memakai offset tetap `+07:00`. Jika ada sekolah di zona waktu lain, tambahkan pilihan timezone.
- **Draft dengan soal yang sudah dihapus disembunyikan dari editor.** Detail menampilkan warning, tetapi menyimpan editor akan menghapus baris yang tidak valid. Ini disengaja agar draft bisa dibersihkan; perlu konfirmasi eksplisit bila UX dianggap terlalu agresif.

### Pelaksanaan ujian

- **Token ujian belum punya rate limit.** Token 6 karakter dari 32 alphabet cukup besar, tetapi endpoint join bisa di-spam. Respons tetap generik `404`; tambahkan rate limit per IP/user sebelum produksi.
- **Tidak ada session lock per attempt.** `revision` mencegah lost update, tetapi dua perangkat tetap bisa membuka attempt yang sama. Perlu kebijakan satu sesi aktif/anti-cheat di fase lanjutan.
- **Lazy finalize adalah side effect pada GET.** Attempt `IN_PROGRESS` yang lewat expiry diselesaikan saat GET/join/submit/time. Sejak Fase 7, dashboard grading juga melakukan lazy sweep maksimal 25 attempt per request; tidak ada scheduler/cron, jadi attempt yang tidak pernah tersentuh tetap menggantung sampai ada request terkait.
- **`receivedAt` hanya untuk audit.** UI siswa menampilkan `submittedAt` (waktu efektif), bukan `receivedAt`. Teacher view Fase 7 sebaiknya membaca `receivedAt` untuk mendeteksi submit telat.
- **Short answer rawan false negative.** Normalisasi hanya trim/lowercase/collapse whitespace + NFKC; `"3,14"` vs `"3.14"`, satuan, dan sinonim tidak ditangani. Fase 7 perlu koreksi manual per jawaban.
- **Result page summary-only.** Belum ada review per soal, kunci jawaban, atau explanation untuk siswa. Ini disengaja agar kebijakan review ditentukan di Fase 7.
- **`@@unique([examId, studentId])` mengunci retake.** Retake Fase 9 memerlukan `attemptNumber` + migrasi unique, bukan hard-delete attempt (histori nilai hilang).
- **Anti-cheat belum ada.** `tabSwitchCount` sengaja ditunda. Tidak ada deteksi blur, copy/paste, atau watermark soal.
- **Data attempt korup tidak bisa direparasi lewat UI.** `questionOrder`/`optionOrder` invalid menghasilkan `500` eksplisit; perbaikan harus lewat SQL/admin tool.
- **`selectedLabels` tidak punya CHECK constraint.** Validasi label ada di aplikasi, bukan database. Query/report Fase 8 harus tetap defensif.
- **Seed mereset attempt demo.** `npm run db:seed` menghapus attempt pada `demo-exam-1` agar `ExamQuestion` bisa dibangun ulang tanpa melanggar FK `Restrict`. Jangan jalankan pada data produksi.

### Penilaian essay

- **Feedback per esai belum ada.** Fase 7 hanya menyimpan `score`; guru belum bisa meninggalkan komentar. Tambahkan `Answer.feedback String? @db.Text` di Fase 8/9.
- **Audit hanya menyimpan aktor terakhir.** `Answer.gradedById`/`gradedAt` dan `Attempt.gradedById` bukan riwayat perubahan. Regrade berulang hanya menyisakan aktor terakhir; audit log penuh ditunda ke Fase 9.
- **Short answer dapat dikoreksi TEACHER meski `GRADED`.** Ini pengecualian sengaja karena normalisasi short answer heuristik (lihat tech debt Fase 6). Nilai esai tetap terkunci untuk TEACHER setelah `GRADED`.
- **Placeholder Answer untuk essay kosong.** Baris `Answer` buatan grading memakai `textAnswer: null`, `selectedLabels: []`, dan `answeredAt = submittedAt`. Query report Fase 8 harus memperlakukan baris ini sebagai “tidak dijawab”, bukan jawaban siswa.
- **Tidak ada tombol finalize eksplisit.** Attempt otomatis `GRADED` saat esai terakhir disimpan; UI memakai dialog konfirmasi. Jika guru salah memasukkan nilai terakhir, koreksi harus lewat admin.
- **Lazy sweep dibatasi 25 per request.** Jika ada >25 attempt expired, attempt sisanya baru difinalisasi saat dashboard dibuka lagi. Tidak ada scheduler/cron.
- **Detail grading memuat seluruh essay sekaligus.** 200 soal × 20.000 karakter bisa menghasilkan payload besar; pagination essay belum ada.
- **Tidak ada CHECK constraint `score >= 0` / `score <= points`.** Validasi hanya di aplikasi; query/report harus tetap defensif.
- **Tidak ada rate limit endpoint grading.** Akses sudah dibatasi TEACHER/ADMIN dan scope exam, tetapi belum ada rate limit per user.

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
- `@radix-ui/react-alert-dialog` dipakai untuk konfirmasi hapus dan konfirmasi simpan esai terakhir (komponen shadcn `alert-dialog`); tidak ada dependensi UI lain yang berubah.

## Fase Berikutnya

Fase 8 (laporan & export hasil) selesai. Fase berikutnya disarankan:
- manajemen pengguna dan mata pelajaran (CRUD, import siswa/kelas),
- KKM/passing grade per mapel/kelas + rekap kelulusan,
- analisis butir soal (difficulty index, discrimination index) dari `Answer`,
- feedback per esai (`Answer.feedback`) dan tombol finalize eksplisit,
- audit log penuh untuk perubahan nilai/manual override,
- tampilan hasil per soal untuk siswa (opsional, tetap menghormati `showResult`),
- scheduler/cron untuk finalisasi attempt expired agar laporan tidak bergantung pada request grading.
