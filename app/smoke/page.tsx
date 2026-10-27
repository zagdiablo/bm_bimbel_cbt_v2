"use client";

import { useState } from "react";
import {
  Alert,
  AlertContent,
  AlertIcon,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  DialogContent,
  DialogTrigger,
  Input,
  Select,
  SelectList,
  SelectOption,
  SelectTrigger,
  Typography,
} from "@material-tailwind/react";

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
        <Typography variant="h4">
          Material Tailwind smoke test
        </Typography>
        <Typography className="opacity-70">
          Halaman sementara untuk memvalidasi komponen inti.
        </Typography>
      </div>

      <Card>
        <CardHeader className="p-4">
          <Typography variant="h6">Form controls</Typography>
        </CardHeader>
        <CardBody className="flex flex-col gap-4 p-4 pt-0">
          <div className="flex flex-col gap-2">
            <label htmlFor="smoke-input" className="text-sm font-medium">
              Nama
            </label>
            <Input
              id="smoke-input"
              data-testid="smoke-input"
              placeholder="Tulis nama"
              color="primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Mata pelajaran</span>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger data-testid="smoke-select" placeholder="Pilih mapel">
                {({ value, element }) =>
                  element ??
                  subjects.find((item) => item.value === (value ?? subject))?.label ??
                  "Pilih mapel"
                }
              </SelectTrigger>
              <SelectList>
                {subjects.map((item) => (
                  <SelectOption key={item.value} value={item.value}>
                    {item.label}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
            <span className="text-xs opacity-70" data-testid="selected-subject">
              Dipilih: {subject}
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button data-testid="smoke-button" onClick={() => setDialogOpen(true)}>
              Buka dialog
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger as="span" className="hidden">
                Dialog
              </DialogTrigger>
              <DialogContent data-testid="smoke-dialog">
                <Typography variant="h6">Dialog aktif</Typography>
                <Typography className="mt-2">
                  Komponen Dialog berhasil dirender dan dapat ditutup.
                </Typography>
                <div className="mt-4">
                  <Button size="sm" onClick={() => setDialogOpen(false)}>
                    Tutup
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button color="secondary" variant="outline" data-testid="smoke-outline">
              Tombol sekunder
            </Button>
          </div>
        </CardBody>
      </Card>

      <Alert color="success" data-testid="smoke-alert">
        <AlertIcon />
        <AlertContent>Alert berhasil dirender.</AlertContent>
      </Alert>

      <Card>
        <CardHeader className="p-4">
          <Typography variant="h6">Table (native Tailwind)</Typography>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="smoke-table">
            <thead className="bg-surface-light">
              <tr>
                <th className="px-4 py-3 font-semibold">No</th>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Nilai</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-surface">
                <td className="px-4 py-3">1</td>
                <td className="px-4 py-3">Siswa Demo</td>
                <td className="px-4 py-3">90</td>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>
    </main>
  );
}
