"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, UploadCloud } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type SubjectOption = { id: string; name: string; code: string };

type PreviewResponse = {
  importJobId?: string;
  message?: string;
};

export function UploadForm({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const needsSubject = Boolean(
    file && !file.name.toLowerCase().endsWith(".xlsx"),
  );

  function chooseFile(nextFile: File | undefined) {
    setError(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("Ukuran file maksimal 10MB.");
      return;
    }

    const extension = nextFile.name.split(".").pop()?.toLowerCase();

    if (!extension || !["xlsx", "docx", "pdf"].includes(extension)) {
      setFile(null);
      setError("Format file harus .xlsx, .docx, atau .pdf.");
      return;
    }

    setFile(nextFile);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function handleSubmit() {
    if (!file || uploading) {
      return;
    }

    if (needsSubject && !subjectId) {
      setError("Pilih mata pelajaran untuk file DOCX/PDF.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    if (subjectId) {
      formData.append("subjectId", subjectId);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/questions/import/preview");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setProgress(100);

      let data: PreviewResponse | null = null;

      try {
        data = JSON.parse(xhr.responseText) as PreviewResponse;
      } catch {
        data = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && data?.importJobId) {
        router.push(`/teacher/questions/import/${data.importJobId}`);
        return;
      }

      setError(data?.message ?? "Gagal memproses file. Coba lagi.");
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("Tidak dapat menghubungi server. Coba lagi.");
    };

    xhr.send(formData);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
          )}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {file ? file.name : "Tarik file ke sini atau klik untuk memilih"}
          </p>
          <p className="text-xs text-muted-foreground">
            XLSX, DOCX, atau PDF · maksimal 10MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.docx,.pdf"
            className="hidden"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="import-subject">
            Mata pelajaran (DOCX/PDF)
          </Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger id="import-subject">
              <SelectValue placeholder="Pilih mata pelajaran" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name} ({subject.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            XLSX memakai kolom <code>subject_code</code> per baris. DOCX/PDF
            memakai satu mapel untuk seluruh file.
          </p>
        </div>

        {uploading ? (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mengunggah dan memproses... {progress}%
            </p>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Import gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!file || uploading || (needsSubject && !subjectId)}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4" />
                Upload &amp; Preview
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
