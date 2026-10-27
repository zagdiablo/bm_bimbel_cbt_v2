const WIB_TIME_ZONE = "Asia/Jakarta";
const WIB_OFFSET = "+07:00";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatWib(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: WIB_TIME_ZONE,
  }).format(date)} WIB`;
}

/**
 * Mengubah ISO/Date menjadi nilai `datetime-local` dalam WIB. Dipakai form
 * edit supaya guru melihat jam yang sama dengan yang akan ditampilkan detail.
 */
export function isoToWibInput(
  value: Date | string | null | undefined,
): string {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get(
    "minute",
  )}`;
}

/**
 * Nilai `datetime-local` dianggap WIB (UTC+7, tanpa DST). Ini menghindari
 * pergeseran 7 jam kalau browser/server berada di zona waktu berbeda.
 */
export function wibInputToIso(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
  const date = new Date(`${withSeconds}${WIB_OFFSET}`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} menit`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0
    ? `${hours} jam`
    : `${hours} jam ${pad(rest)} menit`;
}
