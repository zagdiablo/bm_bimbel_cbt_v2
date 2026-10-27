/**
 * Attempt IN_PROGRESS yang sudah lewat expiry difinalisasi secara lazy saat
 * dashboard penilaian dibuka. Batas ini mencegah satu request memicu ratusan
 * transaksi sekaligus; sisa attempt akan diproses pada request berikutnya.
 */
export const LAZY_SWEEP_LIMIT = 25;

/**
 * Selisih `receivedAt - submittedAt` yang dianggap submit terlambat. Submit
 * normal hampir selalu < 1 detik; beri ruang untuk latency jaringan.
 */
export const LATE_SUBMISSION_THRESHOLD_MS = 60_000;
