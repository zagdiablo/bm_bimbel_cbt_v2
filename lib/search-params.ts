/**
 * Next.js `searchParams` bisa berisi string, array, atau undefined. Schema Zod
 * memakai `Object.fromEntries`-style record, jadi nilai kosong/array perlu
 * dinormalisasi lebih dulu. Nilai pertama dipakai untuk key yang duplikat.
 */
export function normalizeSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") {
      entries.push([key, value]);
      continue;
    }

    if (Array.isArray(value) && value[0]) {
      entries.push([key, value[0]]);
    }
  }

  return Object.fromEntries(entries);
}
