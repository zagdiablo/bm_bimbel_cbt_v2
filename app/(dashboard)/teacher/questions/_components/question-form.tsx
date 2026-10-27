"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
} from "@/lib/questions/labels";
import {
  OPTION_LABEL_ALPHABET,
  difficultySchema,
  questionInputSchema,
  questionTypeSchema,
  type DifficultyValue,
  type QuestionOptionInput,
  type QuestionTypeValue,
} from "@/lib/zod-schemas/question";

export type QuestionFormValues = {
  subjectId: string;
  type: QuestionTypeValue;
  questionText: string;
  explanation: string;
  difficulty: DifficultyValue;
  points: number;
  options: QuestionOptionInput[];
  correctAnswer: boolean;
  correctAnswers: string[];
};

export type QuestionFormInitialValues = QuestionFormValues;

type QuestionPayload = z.input<typeof questionInputSchema>;

type QuestionFormProps = {
  mode: "create" | "edit";
  subjects: { id: string; name: string; code: string }[];
  questionId?: string;
  initialValues?: QuestionFormInitialValues;
};

function toPayload(values: QuestionFormValues): QuestionPayload {
  const base = {
    subjectId: values.subjectId,
    questionText: values.questionText,
    explanation: values.explanation.trim() ? values.explanation : undefined,
    difficulty: values.difficulty,
    points: values.points,
  };

  switch (values.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return { ...base, type: values.type, options: values.options };
    case "TRUE_FALSE":
      return { ...base, type: values.type, correctAnswer: values.correctAnswer };
    case "SHORT_ANSWER":
      return { ...base, type: values.type, correctAnswers: values.correctAnswers };
    case "ESSAY":
      return { ...base, type: values.type };
  }
}

/**
 * Schema form = payung field semua tipe → dibentuk ulang sesuai `type` →
 * divalidasi oleh schema kanonik `questionInputSchema`. Dengan begitu aturan
 * ketat (strict + superRefine) tidak diduplikasi di UI.
 */
const questionFormSchema = z
  .object({
    subjectId: z.string(),
    type: questionTypeSchema,
    questionText: z.string(),
    explanation: z.string(),
    difficulty: difficultySchema,
    points: z.number(),
    options: z.array(
      z.object({
        label: z.string(),
        text: z.string(),
        isCorrect: z.boolean(),
      }),
    ),
    correctAnswer: z.boolean(),
    correctAnswers: z.array(z.string()),
  })
  .transform(toPayload)
  .pipe(questionInputSchema);

function emptyOptions(count = 4, firstCorrect = false): QuestionOptionInput[] {
  return Array.from({ length: count }, (_, index) => ({
    label: OPTION_LABEL_ALPHABET[index],
    text: "",
    isCorrect: firstCorrect && index === 0,
  }));
}

function emptyAnswers(type: QuestionTypeValue) {
  switch (type) {
    case "SINGLE_CHOICE":
      return {
        options: emptyOptions(4, true),
        correctAnswer: false,
        correctAnswers: [],
      };
    case "MULTIPLE_CHOICE":
      return {
        options: emptyOptions(4, false),
        correctAnswer: false,
        correctAnswers: [],
      };
    case "TRUE_FALSE":
      return { options: [], correctAnswer: true, correctAnswers: [] };
    case "SHORT_ANSWER":
      return { options: [], correctAnswer: false, correctAnswers: [""] };
    case "ESSAY":
      return { options: [], correctAnswer: false, correctAnswers: [] };
  }
}

function makeDefaults(
  subjects: QuestionFormProps["subjects"],
  initialValues?: QuestionFormInitialValues,
): QuestionFormValues {
  if (initialValues) {
    return initialValues;
  }

  return {
    subjectId: subjects[0]?.id ?? "",
    type: "SINGLE_CHOICE",
    questionText: "",
    explanation: "",
    difficulty: "MEDIUM",
    points: 1,
    ...emptyAnswers("SINGLE_CHOICE"),
  };
}

function objectMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as { message?: unknown; root?: { message?: unknown } };

  if (typeof record.message === "string") {
    return record.message;
  }

  if (record.root && typeof record.root.message === "string") {
    return record.root.message;
  }

  return undefined;
}

function fieldMessage(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const nested = (value as Record<string, unknown>)[key];

  return typeof nested === "string" ? nested : objectMessage(nested);
}

export function QuestionForm({
  mode,
  subjects,
  questionId,
  initialValues,
}: QuestionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<QuestionFormValues, unknown, QuestionPayload>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: makeDefaults(subjects, initialValues),
    mode: "onSubmit",
  });

  const type = form.watch("type");
  const options = form.watch("options");
  const correctAnswers = form.watch("correctAnswers");
  const isMultiple = type === "MULTIPLE_CHOICE";
  const isChoice = type === "SINGLE_CHOICE" || isMultiple;

  /**
   * Field milik tipe lain direset saat tipe berganti. Tanpa ini, opsi dari
   * soal pilihan ganda bisa terbawa saat user mengubah tipe ke esai.
   */
  const previousType = useRef(type);
  useEffect(() => {
    if (previousType.current === type) {
      return;
    }

    previousType.current = type;
    const answers = emptyAnswers(type);

    form.resetField("options", { defaultValue: answers.options });
    form.resetField("correctAnswer", { defaultValue: answers.correctAnswer });
    form.resetField("correctAnswers", { defaultValue: answers.correctAnswers });
    form.clearErrors();
  }, [type, form]);

  function relabel(items: QuestionOptionInput[]): QuestionOptionInput[] {
    return items.map((item, index) => ({
      ...item,
      label: OPTION_LABEL_ALPHABET[index] ?? String(index + 1),
    }));
  }

  function addOption() {
    const next = [
      ...form.getValues("options"),
      { label: "", text: "", isCorrect: false },
    ];

    form.setValue("options", relabel(next), { shouldDirty: true });
  }

  function removeOption(index: number) {
    const next = form
      .getValues("options")
      .filter((_, itemIndex) => itemIndex !== index);

    form.setValue("options", relabel(next), { shouldDirty: true });
    form.clearErrors("options");
  }

  function setSingleCorrect(index: number) {
    const next = form
      .getValues("options")
      .map((option, itemIndex) => ({
        ...option,
        isCorrect: itemIndex === index,
      }));

    form.setValue("options", next, { shouldDirty: true });
    form.clearErrors("options");
  }

  function toggleOptionCorrect(index: number) {
    const next = form.getValues("options").map((option, itemIndex) =>
      itemIndex === index
        ? { ...option, isCorrect: !option.isCorrect }
        : option,
    );

    form.setValue("options", next, { shouldDirty: true });
    form.clearErrors("options");
  }

  function addAnswer() {
    form.setValue("correctAnswers", [
      ...form.getValues("correctAnswers"),
      "",
    ], { shouldDirty: true });
  }

  function removeAnswer(index: number) {
    form.setValue(
      "correctAnswers",
      form.getValues("correctAnswers").filter((_, itemIndex) => itemIndex !== index),
      { shouldDirty: true },
    );
    form.clearErrors("correctAnswers");
  }

  async function onSubmit(values: QuestionPayload) {
    setServerError(null);

    const endpoint =
      mode === "edit" && questionId
        ? `/api/questions/${questionId}`
        : "/api/questions";

    try {
      const response = await fetch(endpoint, {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setServerError(data?.message ?? "Gagal menyimpan soal.");
        return;
      }

      toast({
        title: mode === "edit" ? "Soal diperbarui" : "Soal dibuat",
        description:
          mode === "edit"
            ? "Perubahan sudah tersimpan."
            : "Soal baru sudah masuk ke bank soal Anda.",
      });

      router.push("/teacher/questions");
      router.refresh();
    } catch {
      setServerError("Tidak dapat menghubungi server. Coba lagi.");
    }
  }

  const errors = form.formState.errors;
  const optionsError = objectMessage(errors.options);
  const answersError = objectMessage(errors.correctAnswers);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        {subjects.length === 0 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Belum ada mata pelajaran</AlertTitle>
            <AlertDescription>
              Tambahkan subject lewat seed/admin sebelum membuat soal.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Informasi soal</CardTitle>
            <CardDescription>
              Tipe soal menentukan field jawaban yang muncul di bawah.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="subjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mata pelajaran</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih mata pelajaran" />
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipe soal</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih tipe" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {QUESTION_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="questionText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pertanyaan</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Tulis pertanyaan di sini..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kesulitan</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih tingkat" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DIFFICULTY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="points"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poin</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        {...field}
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="explanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pembahasan (opsional)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Penjelasan jawaban untuk ditampilkan setelah ujian..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Boleh dikosongkan. Pembahasan tidak memengaruhi penilaian.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jawaban &amp; kunci</CardTitle>
            <CardDescription>
              {isChoice
                ? isMultiple
                  ? "Tandai satu atau lebih opsi yang benar."
                  : "Tandai tepat satu opsi yang benar."
                : type === "TRUE_FALSE"
                  ? "Pilih kunci jawaban Benar atau Salah."
                  : type === "SHORT_ANSWER"
                    ? "Semua alternatif jawaban yang dianggap benar."
                    : "Soal esai dikoreksi manual, jadi tidak punya kunci otomatis."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isChoice ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Opsi jawaban</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                    disabled={options.length >= 5}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah opsi
                  </Button>
                </div>

                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div
                      key={`${option.label}-${index}`}
                      className="flex items-start gap-3 rounded-md border p-3"
                    >
                      <span className="w-5 pt-2 text-sm font-semibold">
                        {option.label}
                      </span>

                      <div className="flex-1 space-y-1">
                        <Input
                          placeholder={`Teks opsi ${option.label}`}
                          {...form.register(`options.${index}.text`)}
                        />
                        {fieldMessage(
                          Array.isArray(errors.options)
                            ? errors.options[index]
                            : undefined,
                          "text",
                        ) ? (
                          <p className="text-xs font-medium text-destructive">
                            {fieldMessage(
                              Array.isArray(errors.options)
                                ? errors.options[index]
                                : undefined,
                              "text",
                            )}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1 pt-1.5">
                        {isMultiple ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={option.isCorrect}
                            onChange={() => toggleOptionCorrect(index)}
                            aria-label={`Tandai opsi ${option.label} benar`}
                          />
                        ) : (
                          <input
                            type="radio"
                            name="correct-option"
                            className="h-4 w-4 accent-primary"
                            checked={option.isCorrect}
                            onChange={() => setSingleCorrect(index)}
                            aria-label={`Tandai opsi ${option.label} benar`}
                          />
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeOption(index)}
                          disabled={options.length <= 2}
                          aria-label={`Hapus opsi ${option.label}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {optionsError ? (
                  <p className="text-sm font-medium text-destructive">
                    {optionsError}
                  </p>
                ) : null}
              </>
            ) : null}

            {type === "TRUE_FALSE" ? (
              <FormField
                control={form.control}
                name="correctAnswer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kunci jawaban</FormLabel>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={field.value ? "default" : "outline"}
                        aria-pressed={field.value}
                        onClick={() => field.onChange(true)}
                      >
                        Benar
                      </Button>
                      <Button
                        type="button"
                        variant={!field.value ? "default" : "outline"}
                        aria-pressed={!field.value}
                        onClick={() => field.onChange(false)}
                      >
                        Salah
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {type === "SHORT_ANSWER" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Jawaban benar</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addAnswer}
                    disabled={correctAnswers.length >= 10}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah jawaban
                  </Button>
                </div>

                <div className="space-y-2">
                  {correctAnswers.map((_, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          placeholder={`Jawaban ${index + 1}`}
                          {...form.register(`correctAnswers.${index}`)}
                        />
                        {fieldMessage(
                          Array.isArray(errors.correctAnswers)
                            ? errors.correctAnswers[index]
                            : undefined,
                          "message",
                        ) ? (
                          <p className="text-xs font-medium text-destructive">
                            {fieldMessage(
                              Array.isArray(errors.correctAnswers)
                                ? errors.correctAnswers[index]
                                : undefined,
                              "message",
                            )}
                          </p>
                        ) : null}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeAnswer(index)}
                        disabled={correctAnswers.length <= 1}
                        aria-label={`Hapus jawaban ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {answersError ? (
                  <p className="text-sm font-medium text-destructive">
                    {answersError}
                  </p>
                ) : null}
              </>
            ) : null}

            {type === "ESSAY" ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada kunci jawaban. Guru akan mengoreksi jawaban siswa
                secara manual.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {serverError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gagal menyimpan</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/teacher/questions">Batal</Link>
          </Button>
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || subjects.length === 0}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyimpan...
              </>
            ) : mode === "edit" ? (
              "Simpan perubahan"
            ) : (
              "Buat soal"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
