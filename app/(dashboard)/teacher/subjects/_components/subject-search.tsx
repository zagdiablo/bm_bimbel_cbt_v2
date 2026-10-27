"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Search mapel berbasis URL (`?search=`), debounce 300ms. Pola ini sama
 * dengan filter Bank Soal supaya state bisa di-bookmark dan di-share.
 */
export function SubjectSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(currentSearch);

  // Sinkron saat user memakai back/forward atau mereset pencarian.
  useEffect(() => {
    setSearch(currentSearch);
  }, [currentSearch]);

  useEffect(() => {
    if (search === currentSearch) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const value = search.trim();

      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }

      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    }, 300);

    return () => clearTimeout(timer);
    // `searchParams`/router sengaja tidak masuk deps: menambahkannya akan
    // me-reset debounce setiap navigasi (sama seperti FilterBar Bank Soal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, currentSearch]);

  function resetSearch() {
    setSearch("");
    startTransition(() => router.replace(pathname, { scroll: false }));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau kode mapel..."
            className="pl-8"
            aria-label="Cari mapel"
          />
        </div>

        {currentSearch ? (
          <Button
            type="button"
            variant="ghost"
            onClick={resetSearch}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
            Reset
          </Button>
        ) : null}

        {isPending ? (
          <Loader2
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-label="Memuat"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
