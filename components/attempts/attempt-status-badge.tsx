import { Badge } from "@/components/ui/badge";

type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "GRADED";

export function AttemptStatusBadge({
  status,
  isExpired = false,
}: {
  status: AttemptStatus | null;
  isExpired?: boolean;
}) {
  if (!status) {
    return <Badge variant="outline">Belum mulai</Badge>;
  }

  if (status === "IN_PROGRESS") {
    return isExpired ? (
      <Badge variant="destructive">Waktu habis</Badge>
    ) : (
      <Badge>Sedang berjalan</Badge>
    );
  }

  if (status === "SUBMITTED") {
    return <Badge variant="secondary">Menunggu penilaian</Badge>;
  }

  return <Badge variant="outline">Sudah dinilai</Badge>;
}
