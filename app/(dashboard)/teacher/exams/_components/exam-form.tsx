"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { wibInputToIso } from "@/lib/exams/datetime";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/questions/labels";

import { QuestionPickerDialog } from "./question-picker-dialog";
import type { PickerQuestion, SelectedExamQuestion } from "./types";

const examFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Judul ujian minimal 3 karakter")
      .max(200, "Judul ujian maksimal 200 karakter"),
    subjectId: z.string().min(1, "Mata pelajaran wajib dipilih"),
    durationMinutes: z
      .number({ invalid_type_error: "Durasi harus berupa angka" })
      .int("Durasi harus bilangan bulat")
      .min(1, "Durasi minimal 1 menit")
      .max(480, "Durasi maksimal 480 menit"),
    startAt: z.string(),
    endAt: z.string(),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    showResult: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const start = value.startAt ? wibInputToIso(value.startAt) : null;
    const end = value.endAt ? wibInputToIso(value.endAt) : null;

    if (value.startAt && !start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: "Format waktu mulai tidak valid",
      });
    }

    if (value.endAt && !end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Format waktu selesai tidak valid",
      });
    }

    if (start && end && new Date(start) >= new Date(end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Waktu selesai harus setelah waktu mulai",
      });
    }
  });

export type ExamFormValues = z.infer<typeof examFormSchema>;

type SubjectOption = { id: string; name: string; code: string };

type ExamFormProps = {
  mode: "create" | "edit";
  subjects: SubjectOption[];
  examId?: string;
  initialValues?: ExamFormValues;
  initialQuestions?: SelectedExamQuestion[];
};

async function readErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return body?.message ?? "Terjadi kesalahan pada server.";
}

function toSelectedQuestion(question: PickerQuestion): SelectedExamQuestion {
  return {
    questionId: question.id,
    questionText: question.questionText,
    type: question.type,
    difficulty: question.difficulty,
    defaultPoints: question.points,
    pointsOverride: null,
    sourceAvailable: true,
  };
}

export function ExamForm({
  mode,
  subjects,
  examId,
  initialValues,
  initialQuestions = [],
}: ExamFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] =
    useState<SelectedExamQuestion[]>(initialQuestions);

  const form = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues:
      initialValues ??
      {
        title: "",
        subjectId: subjects[0]?.id ?? "",
        durationMinutes: 90,
        startAt: "",
        endAt: "",
        shuffleQuestions: false,
        shuffleOptions: false,
        showResult: true,
      },
  });

  const selectedIds = useMemo(
    () => selected.map((question) => question.questionId),
    [selected],
  );

  const totalPoints = selected.reduce(
    (total, question) => total + (question.pointsOverride ?? question.defaultPoints),
    0,
  );

  function handleApply(ids: string[], loaded: PickerQuestion[]) {
    const loadedMap = new Map(loaded.map((question) => [question.id, question]));
    const kept = selected.filter((question) =>
      ids.includes(question.questionId),
    );
    const keptIds = new Set(kept.map((question) => question.questionId));
    const added = ids
      .filter((id) => !keptIds.has(id))
      .map((id) => loadedMap.get(id))
      .filter((question): question is PickerQuestion => question !== undefined)
      .map(toSelectedQuestion);

    setSelected([...kept, ...added]);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= selected.length || from === to) {
      return;
    }

    setSelected((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);

      if (!item) {
        return current;
      }

      next.splice(to, 0, item);

      return next;
    });
  }

  function setPointsOverride(index: number, raw: string) {
    if (raw === "") {
      setSelected((current) =>
        current.map((question, questionIndex) =>
          questionIndex === index
            ? { ...question, pointsOverride: null }
            : question,
        ),
      );
      return;
    }

    const parsed = Number(raw);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000) {
      return;
    }

    setSelected((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index
          ? { ...question, pointsOverride: parsed }
          : question,
      ),
    );
  }

  async function onSubmit(values: ExamFormValues) {
    setSaving(true);

    const payload = {
      ...values,
      title: values.title.trim(),
      startAt: wibInputToIso(values.startAt),
      endAt: wibInputToIso(values.endAt),
    };

    try {
      if (mode === "create") {
        const response = await fetch("/api/exams", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const created = (await response.json()) as { id: string };

        toast({
          title: "Draft ujian dibuat",
          description: "Lanjutkan dengan memilih soal untuk ujian ini.",
        });
        router.push(`/teacher/exams/${created.id}/edit`);
        return;
      }

      if (!examId) {
        throw new Error("ID ujian tidak ditemukan");
      }

      const updateResponse = await fetch(`/api/exams/${examId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        throw new Error(await readErrorMessage(updateResponse));
      }

      const questionsResponse = await fetch(
        `/api/exams/${examId}/questions`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            questions: selected.map((question) => ({
              questionId: question.questionId,
              pointsOverride: question.pointsOverride,
            })),
          }),
        },
      );

      if (!questionsResponse.ok) {
        throw new Error(await readErrorMessage(questionsResponse));
      }

      toast({
        title: "Perubahan disimpan",
        description: "Daftar soal dan informasi ujian sudah diperbarui.",
      });
      router.push(`/teacher/exams/${examId}`);
      router.refresh();
    } catch (error) {
      toast({
        title: "Gagal menyimpan ujian",
        description:
          error instanceof Error
            ? error.message
            : "Tidak dapat menghubungi server. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informasi ujian</CardTitle>
            <CardDescription>
              Jadwal disimpan sebagai UTC dan ditampilkan dalam WIB. Draft boleh
              belum lengkap; publish mewajibkan jadwal terisi.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Judul ujian</FormLabel>
                  <FormControl>
                    <Input placeholder="Contoh: Ulangan Harian Matematika" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mata pelajaran</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={selected.length > 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih mapel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name} ({subject.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {selected.length > 0
                      ? "Kosongkan daftar soal untuk mengganti mapel."
                      : "Soal yang bisa dipilih mengikuti mapel ini."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Durasi (menit)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={Number.isFinite(field.value) ? field.value : ""}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>1–480 menit.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mulai (WIB)</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selesai (WIB)</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3 sm:col-span-2">
              <FormField
                control={form.control}
                name="shuffleQuestions"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </FormControl>
                    <div>
                      <FormLabel>Acak urutan soal</FormLabel>
                      <FormDescription>
                        Urutan acak disimpan per attempt oleh Fase 6.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shuffleOptions"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </FormControl>
                    <div>
                      <FormLabel>Acak pilihan jawaban</FormLabel>
                      <FormDescription>
                        Hanya berpengaruh pada soal yang memiliki opsi.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="showResult"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </FormControl>
                    <div>
                      <FormLabel>Tampilkan hasil setelah selesai</FormLabel>
                      <FormDescription>
                        Nilai dan pembahasan ditampilkan setelah siswa submit
                        (Fase 7).
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {mode === "create" ? (
          <Alert>
            <AlertTitle>Langkah berikutnya</AlertTitle>
            <AlertDescription>
              Setelah draft dibuat, Anda akan diarahkan ke halaman edit untuk
              memilih soal dan mengatur urutan serta poin.
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Soal ujian</CardTitle>
                <CardDescription>
                  {selected.length} soal dipilih · total {totalPoints} poin.
                  Urutan bisa diubah dengan tombol atau kolom posisi.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelected([])}
                  >
                    Kosongkan
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={!form.watch("subjectId")}
                >
                  <Plus className="h-4 w-4" />
                  Pilih Soal
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {selected.length === 0 ? (
                <div className="rounded-md border border-dashed px-6 py-12 text-center">
                  <p className="font-medium">Belum ada soal dipilih</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pilih minimal satu soal dari bank soal untuk bisa
                    mempublikasikan ujian.
                  </p>
                </div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {selected.map((question, index) => (
                    <li
                      key={question.questionId}
                      className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={selected.length}
                          value={index + 1}
                          onChange={(event) => {
                            const target = Number(event.target.value);

                            if (
                              Number.isInteger(target) &&
                              target >= 1 &&
                              target <= selected.length
                            ) {
                              move(index, target - 1);
                            }
                          }}
                          className="h-8 w-16"
                          aria-label="Posisi soal"
                        />
                        <div className="flex flex-col">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => move(index, index - 1)}
                            disabled={index === 0}
                            aria-label="Naikkan urutan"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => move(index, index + 1)}
                            disabled={index === selected.length - 1}
                            aria-label="Turunkan urutan"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm">
                          {question.questionText}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {question.type ? (
                            <Badge variant="secondary">
                              {QUESTION_TYPE_LABEL[question.type]}
                            </Badge>
                          ) : null}
                          {question.difficulty ? (
                            <Badge variant="outline">
                              {DIFFICULTY_LABEL[question.difficulty]}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            Default {question.defaultPoints} poin
                          </span>
                        </div>
                        {!question.sourceAvailable ? (
                          <p className="mt-1 text-xs text-destructive">
                            Soal sudah tidak tersedia di bank soal. Hapus dari
                            daftar sebelum publish.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <Input
                            type="number"
                            min={1}
                            max={1_000}
                            value={question.pointsOverride ?? ""}
                            placeholder={String(question.defaultPoints)}
                            onChange={(event) =>
                              setPointsOverride(index, event.target.value)
                            }
                            className="h-8"
                            aria-label="Poin override"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setSelected((current) =>
                              current.filter(
                                (_, questionIndex) => questionIndex !== index,
                              ),
                            )
                          }
                          aria-label="Hapus soal dari ujian"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href={mode === "edit" && examId ? `/teacher/exams/${examId}` : "/teacher/exams"}>
              Batal
            </Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                {mode === "create" ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {mode === "create" ? "Buat Draft" : "Simpan Perubahan"}
              </>
            )}
          </Button>
        </div>

        <QuestionPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          subjectId={form.watch("subjectId")}
          selectedIds={selectedIds}
          onApply={handleApply}
        />
      </form>
    </Form>
  );
}
