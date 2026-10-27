"use client";

import { useEffect, useRef } from "react";

import { useToast } from "@/hooks/use-toast";

/**
 * Memberi tahu guru bahwa lazy sweep mengubah attempt expired menjadi
 * SUBMITTED/GRADED. Tanpa ini, perubahan status terlihat seperti “hilang”
 * atau berubah sendiri setelah refresh.
 */
export function SweptAttemptsToast({ swept }: { swept: number }) {
  const { toast } = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (swept <= 0 || shown.current) {
      return;
    }

    shown.current = true;
    toast({
      title: "Attempt kedaluwarsa diselesaikan",
      description: `${swept} attempt yang sudah lewat batas waktu telah diselesaikan otomatis dan masuk ke daftar penilaian.`,
    });
  }, [swept, toast]);

  return null;
}
