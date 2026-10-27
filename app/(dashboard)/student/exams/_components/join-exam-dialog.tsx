"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function JoinExamDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/attempts/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        redirectTo?: string;
      } | null;

      if (!response.ok || !body?.redirectTo) {
        setError(body?.message ?? "Gagal bergabung ke ujian.");
        return;
      }

      toast({
        title: "Berhasil bergabung",
        description: "Token diterima. Selamat mengerjakan.",
      });
      setOpen(false);
      router.push(body.redirectTo);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <KeyRound className="h-4 w-4" />
          Gabung ujian
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gabung ujian</DialogTitle>
          <DialogDescription>
            Masukkan token 6 karakter dari guru. Token tidak membedakan huruf
            besar dan kecil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={join} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="exam-token">Token ujian</Label>
            <Input
              id="exam-token"
              value={token}
              onChange={(event) =>
                setToken(event.target.value.toUpperCase().slice(0, 32))
              }
              placeholder="A7K2QX"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              autoFocus
              className="font-mono text-lg tracking-[0.25em]"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading || token.trim() === ""}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Gabung
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
