"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useForm } from "react-hook-form";

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  subjectInputSchema,
  type SubjectInput,
} from "@/lib/zod-schemas/subject";

type SubjectFormSubject = {
  id: string;
  name: string;
  code: string;
};

type SubjectFormDialogProps = {
  mode: "create" | "edit";
  subject?: SubjectFormSubject;
  trigger: ReactNode;
};

type ErrorBody = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

function SubjectFormDialog({
  mode,
  subject,
  trigger,
}: SubjectFormDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SubjectInput>({
    resolver: zodResolver(subjectInputSchema),
    defaultValues: { name: "", code: "" },
  });

  // Reset setiap dialog dibuka agar error/isi submit sebelumnya tidak nyangkut.
  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset({
      name: subject?.name ?? "",
      code: subject?.code ?? "",
    });
    form.clearErrors();
    setServerError(null);
  }, [open, subject, form]);

  async function onSubmit(values: SubjectInput) {
    setSubmitting(true);
    setServerError(null);

    try {
      const endpoint =
        mode === "create" ? "/api/subjects" : `/api/subjects/${subject?.id}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => null)) as ErrorBody | null;

      if (!response.ok) {
        if (response.status === 409) {
          form.setError("code", {
            type: "server",
            message: data?.message ?? "Kode mapel sudah dipakai",
          });
          return;
        }

        if (response.status === 400) {
          let hasFieldError = false;

          for (const key of ["name", "code"] as const) {
            const message = data?.errors?.[key]?.[0];

            if (message) {
              form.setError(key, { type: "server", message });
              hasFieldError = true;
            }
          }

          if (!hasFieldError) {
            setServerError(data?.message ?? "Data mapel tidak valid.");
          }

          return;
        }

        setServerError(
          data?.message ?? "Terjadi kesalahan pada server. Coba lagi.",
        );
        return;
      }

      setOpen(false);
      toast({
        title: mode === "create" ? "Mapel ditambahkan" : "Mapel diperbarui",
        description:
          mode === "create"
            ? "Mapel baru sudah tersedia di dropdown soal dan ujian."
            : "Perubahan mapel sudah disimpan.",
      });

      // Risiko #12: kalau search aktif, mapel baru bisa tidak terlihat.
      // Arahkan ulang ke list tanpa filter setelah create.
      if (mode === "create") {
        router.push("/teacher/subjects");
        router.refresh();
      } else {
        router.refresh();
      }
    } catch {
      setServerError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tambah mapel" : "Edit mapel"}
          </DialogTitle>
          <DialogDescription>
            Kode mapel harus unik dan otomatis disimpan dalam huruf besar.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama mapel</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Matematika"
                      maxLength={100}
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kode mapel</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="MTK"
                      maxLength={20}
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono uppercase"
                      {...field}
                      onChange={(event) =>
                        field.onChange(event.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Huruf, angka, strip, dan underscore. Contoh: MTK, IPA-1.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {mode === "create" ? "Simpan" : "Simpan perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateSubjectDialog({ trigger }: { trigger?: ReactNode }) {
  return (
    <SubjectFormDialog
      mode="create"
      trigger={
        trigger ?? (
          <Button>
            <Plus className="h-4 w-4" />
            Tambah Mapel
          </Button>
        )
      }
    />
  );
}

export function EditSubjectDialog({
  subject,
}: {
  subject: SubjectFormSubject;
}) {
  return (
    <SubjectFormDialog
      mode="edit"
      subject={subject}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit mapel ${subject.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      }
    />
  );
}
