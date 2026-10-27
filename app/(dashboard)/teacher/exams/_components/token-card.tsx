"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function TokenCard({ token }: { token: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast({
        title: "Gagal menyalin token",
        description: "Salin token secara manual dari kotak di samping.",
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          Token ujian
        </CardTitle>
        <CardDescription>
          Bagikan token ini kepada siswa saat ujian dibuka.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-muted px-4 py-2 font-mono text-2xl font-semibold tracking-[0.35em]">
            {token}
          </code>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Tersalin
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Salin
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
