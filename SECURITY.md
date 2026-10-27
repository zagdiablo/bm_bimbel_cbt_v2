# Security Policy

CBT App menangani data ujian, jawaban siswa, dan nilai. Dokumen ini merangkum
model keamanan, batasan yang diketahui, dan checklist hardening sebelum
production.

## Versi yang didukung

Aplikasi di-deploy sebagai satu instance. Hanya kode pada branch rilis terakhir
yang menerima perbaikan keamanan. Tidak ada dukungan multi-versi.

## Melaporkan vulnerability

Jangan membuka issue publik untuk vulnerability yang belum diperbaiki. Kirim
detail (reproduksi, dampak, versi) ke maintainer aplikasi/internal sekolah.
Sertakan langkah mitigasi bila ada. Target respons awal: 3 hari kerja.

## Model autentikasi

- Autentikasi memakai **better-auth** dengan session cookie.
- Cookie session memakai `HttpOnly`, `SameSite=Lax`, dan `Secure` otomatis bila
  `BETTER_AUTH_URL` memakai HTTPS.
- Cookie cache session berumur pendek (5 menit) dan ditandatangani dengan
  `BETTER_AUTH_SECRET`. Middleware memakainya hanya untuk UX redirect; **otorisasi
  otoritatif tetap dilakukan di server component/route dengan Prisma**.
- Rotasi `BETTER_AUTH_SECRET` membatalkan seluruh sesi. Lakukan saat maintenance.
- Belum ada verifikasi email, reset password, MFA, dan manajemen sesi per
  perangkat.

## Otorisasi dan scope data

- Role: `ADMIN`, `TEACHER`, `STUDENT`.
- `/teacher/*` dapat diakses TEACHER dan ADMIN (ADMIN adalah super-user).
- Middleware hanya gate awal. Setiap route memanggil `requireRole`/`requirePageRole`
  dan memverifikasi scope:
  - TEACHER hanya melihat exam/soal/attempt miliknya.
  - TEACHER non-owner mendapat **404**, bukan 403, agar keberadaan data tidak bocor.
  - STUDENT hanya melihat exam/attempt miliknya dan tidak pernah menerima kunci
    jawaban, `explanation`, `score`, atau `snapshotJson`.
- Report dan analytics hanya untuk TEACHER/ADMIN.

## Token ujian

- Token 6 karakter dari alphabet 32 karakter tanpa karakter ambigu.
- Token bersifat case-insensitive saat join.
- **Belum ada rate limit pada endpoint join.** Token cukup acak, tetapi endpoint
  dapat di-spam. Ini blocker P0 sebelum production.
- **Belum ada rotasi/revoke token.** Setelah publish, token tidak bisa diganti
  tanpa fitur baru. Jika token bocor, exam harus ditutup dan dibuat ulang.

## Upload dan parser file

- Import soal membatasi ukuran file (10MB) dan tipe file (XLSX/DOCX/PDF).
- File disimpan di `uploads/imports` (bukan `public/`), dengan nama unik.
- Parser (`xlsx`, `mammoth`, `pdf-parse`) memproses input guru/admin. File dari
  pengguna anonim tidak diizinkan.
- `xlsx@0.18.5` memiliki advisory high tanpa fix (prototype pollution + ReDoS).
  Mitigasi: akses terbatas, batas ukuran, dan rencana migrasi ExcelJS.
- File orphan dapat tertinggal setelah restart; cleanup startup/cron adalah P0.

## Data dan audit

- `Answer.gradedById`/`Attempt.gradedById` dan
  `Exam.publishedById`/`closedById` menyimpan **aktor terakhir**, bukan riwayat.
- Belum ada audit log penuh untuk perubahan soal, nilai, atau metadata ujian.
- Jangan mengandalkan field audit ini sebagai bukti forensik lengkap.

## Secret dan konfigurasi

- Semua secret lewat environment variable; `.env` tidak boleh di-commit.
- `.env.example` hanya berisi placeholder.
- Gunakan user database dengan privilege minimum (bukan superuser, tanpa
  `CREATEDB` di production).
- `SHADOW_DATABASE_URL` hanya untuk development.
- Jangan menjalankan seed/reset di production (membuat akun demo dan menghapus
  data).

## Dependency

Lihat bagian **Dependency Audit (Oktober 2026)** di README. Ringkasan:

- Runtime: `xlsx` (high, no fix), `zod` (high, fix butuh Zod 4), `next/postcss`
  (moderate/high, fix butuh Next 16).
- Dev/build: `prisma` chain (high), `vitest` chain (critical, test-only).
- Jangan menjalankan `npm audit fix --force` tanpa review; itu melakukan upgrade
  mayor.

## Checklist hardening production (P0)

- [ ] Rate limit login, register, join token, publish, dan grading.
- [ ] Rotasi/revoke token ujian.
- [ ] Cleanup startup/cron untuk `uploads/imports`.
- [ ] HTTPS + `BETTER_AUTH_URL` https + secret acak ≥ 32 byte.
- [ ] Backup harian + uji restore.
- [ ] Monitoring 5xx, uptime, dan disk.
- [ ] Hapus/rotasi akun demo; jangan seed production.
- [ ] Review advisory dependency dan jadwalkan upgrade.

## Batasan yang diketahui

- Belum ada anti-cheat (deteksi blur/tab switch, session lock, watermark).
- Belum ada rate limit terpusat (butuh Redis/Upstash).
- Belum ada structured logging/error tracking.
- Belum ada CSP/security headers khusus di `next.config.ts`; review sebelum
  production.
- Belum ada enkripsi at-rest khusus aplikasi; bergantung pada enkripsi disk/DB.
