"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Loader2,
  Send,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { QUESTION_TYPE_LABEL } from "@/lib/questions/labels";
import { cn } from "@/lib/utils";
import type { QuestionTypeValue } from "@/lib/zod-schemas/question";

type SafeAnswer = {
  selectedLabels: string[];
  textAnswer: string | null;
  answeredAt: string;
  revision: number;
};

type AttemptQuestion = {
  examQuestionId: string;
  order: number;
  type: QuestionTypeValue;
  questionText: string;
  points: number;
  options: { label: string; text: string }[];
  answer: SafeAnswer | null;
};

type AttemptPayload = {
  attemptId: string;
  examId: string;
  examTitle: string;
  subject: { name: string; code: string };
  status: "IN_PROGRESS";
  startedAt: string;
  expiresAt: string;
  serverNow: string;
  durationMinutes: number;
  maxScore: number;
  questionOrder: string[];
  questions: AttemptQuestion[];
  isExpired: boolean;
  showResult: boolean;
};

type AnswerState = {
  selectedLabels: string[];
  textAnswer: string;
  revision: number;
  dirty: boolean;
  saving: boolean;
  error: boolean;
};

type AttemptResponse = AttemptPayload & {
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  redirectTo?: string;
  message?: string;
};

function isTextType(type: QuestionTypeValue) {
  return type === "SHORT_ANSWER" || type === "ESSAY";
}

function isAnswered(question: AttemptQuestion, answer: AnswerState) {
  if (isTextType(question.type)) {
    return answer.textAnswer.trim().length > 0;
  }

  return answer.selectedLabels.length > 0;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function TakeExamClient({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [payload, setPayload] = useState<AttemptPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const payloadRef = useRef<AttemptPayload | null>(null);
  const answersRef = useRef<Record<string, AnswerState>>({});
  const versionsRef = useRef<Record<string, number>>({});
  const timersRef = useRef<Record<string, number>>({});
  const inflightRef = useRef<Record<string, boolean>>({});
  const pendingRef = useRef<Record<string, boolean>>({});
  const offsetRef = useRef(0);
  const expiresRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const doSubmitRef = useRef<((auto: boolean) => Promise<void>) | null>(null);

  function commitAnswers(next: Record<string, AnswerState>) {
    answersRef.current = next;
    setAnswers(next);
  }

  function isLocallyExpired() {
    const expiresAt = expiresRef.current;

    return expiresAt !== null && Date.now() + offsetRef.current >= expiresAt;
  }

  useEffect(() => {
    let cancelled = false;
    const timers = timersRef.current;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/attempts/${attemptId}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | (AttemptResponse & { message?: string })
          | null;

        if (!response.ok || !body) {
          setLoadError(body?.message ?? "Gagal memuat ujian.");
          return;
        }

        if (body.status !== "IN_PROGRESS") {
          router.replace(body.redirectTo ?? "/student/exams");
          return;
        }

        if (cancelled) {
          return;
        }

        const initialState: Record<string, AnswerState> = {};

        for (const question of body.questions) {
          initialState[question.examQuestionId] = {
            selectedLabels: question.answer?.selectedLabels ?? [],
            textAnswer: question.answer?.textAnswer ?? "",
            revision: question.answer?.revision ?? 0,
            dirty: false,
            saving: false,
            error: false,
          };
        }

        const offset = Date.parse(body.serverNow) - Date.now();
        const expiresAt = Date.parse(body.expiresAt);

        answersRef.current = initialState;
        payloadRef.current = body;
        offsetRef.current = offset;
        expiresRef.current = expiresAt;
        setAnswers(initialState);
        setPayload(body);
        setRemainingMs(Math.max(0, expiresAt - (Date.now() + offset)));

        const storedIndex = Number(
          window.sessionStorage.getItem(`attempt:${attemptId}:index`) ?? "0",
        );

        if (
          Number.isInteger(storedIndex) &&
          storedIndex >= 0 &&
          storedIndex < body.questions.length
        ) {
          setCurrentIndex(storedIndex);
        }

        const storedFlagged = window.sessionStorage.getItem(
          `attempt:${attemptId}:flagged`,
        );

        if (storedFlagged) {
          try {
            const parsed = JSON.parse(storedFlagged) as unknown;

            if (Array.isArray(parsed)) {
              setFlagged(
                new Set(parsed.filter((item) => typeof item === "string")),
              );
            }
          } catch {
            // UI-only state: abaikan cache yang rusak.
          }
        }
      } catch {
        setLoadError("Tidak dapat menghubungi server. Coba lagi.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, [attemptId, router]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    const tick = () => {
      const expiresAt = expiresRef.current;

      if (expiresAt === null) {
        return;
      }

      const remaining = Math.max(
        0,
        expiresAt - (Date.now() + offsetRef.current),
      );

      setRemainingMs(remaining);

      if (remaining <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        setExpired(true);
        void doSubmitRef.current?.(true);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1_000);

    return () => window.clearInterval(interval);
  }, [payload]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    async function syncTime() {
      try {
        const response = await fetch(`/api/attempts/${attemptId}/time`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as {
          status?: string;
          serverNow?: string;
          expiresAt?: string;
        } | null;

        if (!response.ok || !body?.serverNow || !body.expiresAt) {
          return;
        }

        if (body.status !== "IN_PROGRESS") {
          router.replace(`/student/exams/${payloadRef.current?.examId}/result`);
          return;
        }

        offsetRef.current = Date.parse(body.serverNow) - Date.now();
        expiresRef.current = Date.parse(body.expiresAt);
        setRemainingMs(
          Math.max(
            0,
            Date.parse(body.expiresAt) -
              (Date.now() + offsetRef.current),
          ),
        );
      } catch {
        // Timer memakai offset terakhir; polling berikutnya akan mencoba lagi.
      }
    }

    const interval = window.setInterval(() => void syncTime(), 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncTime();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [attemptId, payload, router]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const hasPending = Object.values(answersRef.current).some(
        (answer) => answer.dirty || answer.saving,
      );

      if (!hasPending || submittingRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    if (payload) {
      window.sessionStorage.setItem(
        `attempt:${attemptId}:index`,
        String(currentIndex),
      );
    }
  }, [attemptId, currentIndex, payload]);

  useEffect(() => {
    if (payload) {
      window.sessionStorage.setItem(
        `attempt:${attemptId}:flagged`,
        JSON.stringify([...flagged]),
      );
    }
  }, [attemptId, flagged, payload]);

  function scheduleSave(examQuestionId: string) {
    const existing = timersRef.current[examQuestionId];

    if (existing) {
      window.clearTimeout(existing);
    }

    timersRef.current[examQuestionId] = window.setTimeout(() => {
      void persistAnswer(examQuestionId);
    }, 1_500);
  }

  function updateAnswer(
    examQuestionId: string,
    patch: Partial<Pick<AnswerState, "selectedLabels" | "textAnswer">>,
  ) {
    if (submittingRef.current) {
      return;
    }

    versionsRef.current[examQuestionId] =
      (versionsRef.current[examQuestionId] ?? 0) + 1;

    const current = answersRef.current[examQuestionId];

    if (!current) {
      return;
    }

    commitAnswers({
      ...answersRef.current,
      [examQuestionId]: {
        ...current,
        ...patch,
        dirty: true,
        error: false,
      },
    });
    scheduleSave(examQuestionId);
  }

  async function persistAnswer(examQuestionId: string): Promise<boolean> {
    if (inflightRef.current[examQuestionId]) {
      pendingRef.current[examQuestionId] = true;
      return false;
    }

    const currentPayload = payloadRef.current;
    const question = currentPayload?.questions.find(
      (item) => item.examQuestionId === examQuestionId,
    );
    const current = answersRef.current[examQuestionId];

    if (!currentPayload || !question || !current) {
      return true;
    }

    const version = versionsRef.current[examQuestionId] ?? 0;
    inflightRef.current[examQuestionId] = true;
    commitAnswers({
      ...answersRef.current,
      [examQuestionId]: { ...current, saving: true },
    });

    const body = isTextType(question.type)
      ? {
          baseRevision: current.revision,
          textAnswer: current.textAnswer,
        }
      : {
          baseRevision: current.revision,
          selectedLabels: current.selectedLabels,
        };

    try {
      const response = await fetch(
        `/api/attempts/${currentPayload.attemptId}/answers/${examQuestionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | {
            updated?: boolean;
            reason?: string;
            revision?: number;
            answer?: SafeAnswer | null;
            message?: string;
          }
        | null;

      if (!response.ok) {
        if (response.status === 403) {
          setExpired(true);
          void doSubmitRef.current?.(true);
          return false;
        }

        if (response.status === 409) {
          router.replace(`/student/exams/${currentPayload.examId}/result`);
          return false;
        }

        const latest = answersRef.current[examQuestionId];

        commitAnswers({
          ...answersRef.current,
          [examQuestionId]: { ...latest, saving: false, error: true },
        });
        return false;
      }

      const latest = answersRef.current[examQuestionId];

      if (data?.updated === false) {
        if (data.answer?.revision !== undefined) {
          commitAnswers({
            ...answersRef.current,
            [examQuestionId]: {
              selectedLabels: data.answer.selectedLabels ?? [],
              textAnswer: data.answer.textAnswer ?? "",
              revision: data.answer.revision,
              dirty: false,
              saving: false,
              error: false,
            },
          });
          toast({
            title: "Jawaban disinkronkan",
            description:
              "Ada perubahan dari tab lain. Server menjadi sumber kebenaran.",
          });
        } else {
          commitAnswers({
            ...answersRef.current,
            [examQuestionId]: { ...latest, saving: false },
          });
        }

        return true;
      }

      const changedSince = (versionsRef.current[examQuestionId] ?? 0) !== version;

      commitAnswers({
        ...answersRef.current,
        [examQuestionId]: {
          ...latest,
          revision: data?.revision ?? latest.revision,
          dirty: changedSince,
          saving: false,
          error: false,
        },
      });

      return true;
    } catch {
      const latest = answersRef.current[examQuestionId];

      commitAnswers({
        ...answersRef.current,
        [examQuestionId]: { ...latest, saving: false, error: true },
      });
      return false;
    } finally {
      inflightRef.current[examQuestionId] = false;

      const shouldRetry =
        pendingRef.current[examQuestionId] ||
        (versionsRef.current[examQuestionId] ?? 0) > version;

      pendingRef.current[examQuestionId] = false;

      if (shouldRetry && !isLocallyExpired()) {
        window.setTimeout(() => {
          void persistAnswer(examQuestionId);
        }, 0);
      }
    }
  }

  async function flushAll() {
    for (const [examQuestionId, timer] of Object.entries(timersRef.current)) {
      window.clearTimeout(timer);
      delete timersRef.current[examQuestionId];
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const busy = Object.values(inflightRef.current).some(Boolean);

      if (!busy) {
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    for (const examQuestionId of Object.keys(answersRef.current)) {
      if (answersRef.current[examQuestionId].dirty) {
        await persistAnswer(examQuestionId);
      }
    }
  }

  async function doSubmit(auto: boolean) {
    if (submittingRef.current || !payloadRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await flushAll();

      const stillDirty = Object.values(answersRef.current).some(
        (answer) => answer.dirty,
      );

      if (stillDirty && !auto) {
        setSubmitError(
          "Beberapa jawaban belum tersimpan. Periksa koneksi lalu coba lagi.",
        );
        return;
      }

      const current = payloadRef.current;
      const response = await fetch(
        `/api/attempts/${current.attemptId}/submit`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        status?: string;
        showResult?: boolean;
        message?: string;
      } | null;

      if (!response.ok) {
        setSubmitError(body?.message ?? "Gagal mengumpulkan ujian.");
        return;
      }

      toast({
        title:
          body?.status === "SUBMITTED" ? "Menunggu penilaian" : "Ujian selesai",
        description: body?.message ?? "Jawaban berhasil dikumpulkan.",
      });
      router.replace(
        body?.showResult
          ? `/student/exams/${current.examId}/result`
          : "/student/exams",
      );
      router.refresh();
    } catch {
      setSubmitError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    doSubmitRef.current = doSubmit;
  });

  const question = payload?.questions[currentIndex];
  const answer = question ? answers[question.examQuestionId] : undefined;
  const answeredCount = useMemo(() => {
    if (!payload) {
      return 0;
    }

    return payload.questions.filter((item) => {
      const state = answers[item.examQuestionId];

      return state ? isAnswered(item, state) : false;
    }).length;
  }, [answers, payload]);
  const progress = payload
    ? Math.round((answeredCount / payload.questions.length) * 100)
    : 0;
  const unanswered = payload ? payload.questions.length - answeredCount : 0;

  function toggleFlag() {
    if (!question) {
      return;
    }

    setFlagged((previous) => {
      const next = new Set(previous);

      if (next.has(question.examQuestionId)) {
        next.delete(question.examQuestionId);
      } else {
        next.add(question.examQuestionId);
      }

      return next;
    });
  }

  function updateChoice(examQuestionId: string, label: string, multiple: boolean) {
    const current = answersRef.current[examQuestionId];

    if (!current) {
      return;
    }

    if (!multiple) {
      updateAnswer(examQuestionId, { selectedLabels: [label] });
      return;
    }

    const exists = current.selectedLabels.includes(label);
    const next = exists
      ? current.selectedLabels.filter((item) => item !== label)
      : [...current.selectedLabels, label];

    updateAnswer(examQuestionId, { selectedLabels: next });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat ujian...
        </CardContent>
      </Card>
    );
  }

  if (loadError || !payload || !question || !answer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ujian tidak dapat dimuat</CardTitle>
          <CardDescription>
            {loadError ?? "Data ujian tidak lengkap."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Muat ulang</Button>
        </CardContent>
      </Card>
    );
  }

  const timerCritical = remainingMs <= 5 * 60_000;
  const savingLabel = answer.saving
    ? "Menyimpan..."
    : answer.error
      ? "Gagal menyimpan"
      : answer.dirty
        ? "Belum tersimpan"
        : answer.revision > 0
          ? "Tersimpan"
          : "Belum dijawab";

  return (
    <div className="flex flex-col gap-4">
      <Card className="sticky top-0 z-20">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{payload.examTitle}</p>
              <p className="text-sm text-muted-foreground">
                {payload.subject.name} · {payload.durationMinutes} menit ·{" "}
                {answeredCount}/{payload.questions.length} terjawab
              </p>
            </div>

            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-lg font-semibold",
                timerCritical
                  ? "border-destructive text-destructive"
                  : "text-foreground",
              )}
              aria-live="polite"
            >
              <Clock3 className="h-5 w-5" />
              {formatRemaining(remainingMs)}
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                Soal {currentIndex + 1} dari {payload.questions.length}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {QUESTION_TYPE_LABEL[question.type]}
                </Badge>
                <Badge variant="outline">{question.points} poin</Badge>
              </div>
            </div>
            <CardDescription className={cn(answer.error && "text-destructive")}>
              {savingLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="whitespace-pre-wrap text-base leading-relaxed">
              {question.questionText}
            </p>

            {question.type === "SINGLE_CHOICE" ||
            question.type === "TRUE_FALSE" ? (
              <div className="flex flex-col gap-2">
                {question.options.map((option) => {
                  const checked = answer.selectedLabels.includes(option.label);

                  return (
                    <label
                      key={option.label}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`question-${question.examQuestionId}`}
                        checked={checked}
                        onChange={() =>
                          updateChoice(
                            question.examQuestionId,
                            option.label,
                            false,
                          )
                        }
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">
                        <span className="mr-2 font-semibold">
                          {option.label}.
                        </span>
                        {option.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            {question.type === "MULTIPLE_CHOICE" ? (
              <div className="flex flex-col gap-2">
                {question.options.map((option) => {
                  const checked = answer.selectedLabels.includes(option.label);

                  return (
                    <label
                      key={option.label}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          updateChoice(
                            question.examQuestionId,
                            option.label,
                            true,
                          )
                        }
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="text-sm">
                        <span className="mr-2 font-semibold">
                          {option.label}.
                        </span>
                        {option.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            {question.type === "SHORT_ANSWER" ? (
              <Input
                value={answer.textAnswer}
                onChange={(event) =>
                  updateAnswer(question.examQuestionId, {
                    textAnswer: event.target.value,
                  })
                }
                placeholder="Tulis jawaban singkat"
                maxLength={20_000}
              />
            ) : null}

            {question.type === "ESSAY" ? (
              <Textarea
                value={answer.textAnswer}
                onChange={(event) =>
                  updateAnswer(question.examQuestionId, {
                    textAnswer: event.target.value,
                  })
                }
                placeholder="Tulis jawaban esai"
                rows={8}
                maxLength={20_000}
              />
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleFlag}
              >
                <Flag
                  className={cn(
                    "h-4 w-4",
                    flagged.has(question.examQuestionId) && "fill-current",
                  )}
                />
                {flagged.has(question.examQuestionId)
                  ? "Hapus tanda ragu"
                  : "Tandai ragu-ragu"}
              </Button>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentIndex((index) => Math.max(0, index - 1))
                  }
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    setCurrentIndex((index) =>
                      Math.min(payload.questions.length - 1, index + 1),
                    )
                  }
                  disabled={currentIndex === payload.questions.length - 1}
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Navigasi soal</CardTitle>
            <CardDescription>
              {answeredCount} terjawab · {flagged.size} ragu-ragu
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-5 gap-2">
              {payload.questions.map((item, index) => {
                const state = answers[item.examQuestionId];
                const answered = state ? isAnswered(item, state) : false;
                const isCurrent = index === currentIndex;
                const isFlagged = flagged.has(item.examQuestionId);

                return (
                  <button
                    key={item.examQuestionId}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-md border text-sm font-medium transition-colors",
                      answered
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted",
                      isCurrent && "ring-2 ring-ring ring-offset-1",
                      isFlagged && "border-amber-500",
                    )}
                    aria-label={`Soal ${index + 1}`}
                  >
                    {index + 1}
                    {isFlagged ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-primary" /> Terjawab
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border bg-background" />{" "}
                Belum dijawab
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-amber-500" />{" "}
                Ragu-ragu
              </span>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={submitting} className="w-full">
                  <Send className="h-4 w-4" />
                  Kumpulkan ujian
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Kumpulkan ujian sekarang?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {unanswered > 0
                      ? `Masih ada ${unanswered} soal yang belum dijawab. `
                      : "Semua soal sudah dijawab. "}
                    Setelah dikumpulkan, jawaban tidak dapat diubah.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Periksa lagi</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void doSubmit(false)}>
                    Ya, kumpulkan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {submitError ? (
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {expired || submitting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                {expired ? "Waktu ujian habis" : "Mengumpulkan ujian"}
              </CardTitle>
              <CardDescription>
                {submitting
                  ? "Jawaban yang sudah tersimpan sedang dikumpulkan..."
                  : submitError
                    ? submitError
                    : "Menyiapkan hasil ujian..."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              {submitting ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengumpulkan...
                </span>
              ) : expired ? (
                <Button onClick={() => void doSubmit(true)}>
                  <Check className="h-4 w-4" />
                  Coba kumpulkan lagi
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
