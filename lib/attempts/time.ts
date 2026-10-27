/**
 * Satu sumber waktu untuk seluruh alur attempt. Route handler memakai
 * `nowDate()`; test pure function bisa memberi `now` eksplisit.
 *
 * Catatan: jangan mengandalkan `@default(now())` database untuk logika timer.
 * Semua timestamp yang memengaruhi attempt diisi eksplisit dari aplikasi.
 */
export function nowDate(): Date {
  return new Date();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * `expiresAt = min(startedAt + duration, exam.endAt)`.
 * Kalau `endAt` null (data lama/korup), fallback ke durasi saja; pemanggil
 * tetap wajib menolak join untuk ujian PUBLISHED tanpa jadwal lengkap.
 */
export function computeExpiresAt(
  startedAt: Date,
  durationMinutes: number,
  endAt: Date | null,
): Date {
  const byDuration = addMinutes(startedAt, durationMinutes);

  if (!endAt) {
    return byDuration;
  }

  return endAt.getTime() < byDuration.getTime() ? endAt : byDuration;
}

/** Attempt dianggap habis tepat saat `now >= expiresAt` (sisa waktu 0). */
export function hasExpired(expiresAt: Date, now: Date = nowDate()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function remainingMs(
  expiresAt: Date,
  now: Date = nowDate(),
): number {
  return Math.max(0, expiresAt.getTime() - now.getTime());
}

/**
 * Waktu submit efektif. Submit yang telat tetap diterima, tetapi dicap ke
 * `expiresAt` supaya tidak ada tambahan waktu pengerjaan.
 */
export function effectiveSubmittedAt(expiresAt: Date, now: Date): Date {
  return now.getTime() < expiresAt.getTime() ? now : expiresAt;
}
