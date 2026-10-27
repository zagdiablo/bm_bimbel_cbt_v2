"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const subjects = [
  { value: "mtk", label: "Matematika" },
  { value: "bindo", label: "Bahasa Indonesia" },
];

export default function SmokePage() {
  const [subject, setSubject] = useState("mtk");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          shadcn/ui smoke test
        </h1>
        <p className="text-muted-foreground">
          Halaman sementara untuk memvalidasi komponen inti dan SSR.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Form controls</CardTitle>
          <CardDescription>
            Input, Select, Dialog, dan Button dirender di server tanpa error.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="smoke-input">Nama</Label>
            <Input
              id="smoke-input"
              data-testid="smoke-input"
              placeholder="Tulis nama"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="smoke-select">Mata pelajaran</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger id="smoke-select" data-testid="smoke-select">
                <SelectValue placeholder="Pilih mapel" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground" data-testid="selected-subject">
              Dipilih: {subject}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="smoke-button">Buka dialog</Button>
              </DialogTrigger>
              <DialogContent data-testid="smoke-dialog">
                <DialogHeader>
                  <DialogTitle>Dialog aktif</DialogTitle>
                  <DialogDescription>
                    Komponen Dialog berhasil dirender dan dapat ditutup.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button size="sm">Tutup</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" data-testid="smoke-outline">
              Tombol sekunder
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert data-testid="smoke-alert">
        <AlertTitle>Alert berhasil dirender</AlertTitle>
        <AlertDescription>
          Komponen Alert memakai token warna CSS variables.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Table</CardTitle>
          <CardDescription>Tabel semantik dari shadcn/ui.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          <Table data-testid="smoke-table">
            <TableHeader>
              <TableRow>
                <TableHead>No</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>1</TableCell>
                <TableCell>Siswa Demo</TableCell>
                <TableCell>90</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
