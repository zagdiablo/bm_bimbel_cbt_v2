"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { homePathForRole } from "@/lib/roles";
import { registerSchema, type RegisterInput } from "@/lib/zod-schemas/auth";

type RegisterResponse = {
  user?: { role?: string };
  redirectTo?: string;
  message?: string;
};

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: RegisterInput) {
    setServerError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => null)) as RegisterResponse | null;

      if (!response.ok) {
        setServerError(data?.message ?? "Registrasi gagal");
        return;
      }

      const target =
        data?.redirectTo ?? homePathForRole(data?.user?.role ?? "STUDENT");

      router.replace(target);
      router.refresh();
    } catch {
      setServerError("Tidak dapat menghubungi server. Coba lagi.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar akun siswa</CardTitle>
        <CardDescription>
          Akun baru otomatis mendapat role siswa. Hubungi admin untuk role guru.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama lengkap</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" placeholder="Nama siswa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="nama@sekolah.id"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Minimal 8 karakter"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Minimal 8 karakter.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Registrasi gagal</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Daftar"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>

      <CardFooter className="text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="ml-1 font-medium text-foreground underline">
          Masuk
        </Link>
      </CardFooter>
    </Card>
  );
}
