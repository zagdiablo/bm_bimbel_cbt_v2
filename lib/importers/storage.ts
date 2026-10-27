import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  MAX_IMPORT_FILE_BYTES,
  type ImportFileTypeValue,
} from "@/lib/importers/types";

const DEFAULT_IMPORT_DIR = path.join(process.cwd(), "uploads", "imports");

const FILE_CONFIG = {
  XLSX: {
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: "PK",
  },
  DOCX: {
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: "PK",
  },
  PDF: {
    extension: "pdf",
    mime: "application/pdf",
    magic: "%PDF-",
  },
} as const satisfies Record<
  ImportFileTypeValue,
  { extension: string; mime: string; magic: string }
>;

export type UploadValidation =
  | { ok: true; fileType: ImportFileTypeValue }
  | { ok: false; status: number; message: string };

export function getImportDir(): string {
  return process.env.IMPORT_UPLOAD_DIR ?? DEFAULT_IMPORT_DIR;
}

export function importFilePath(
  jobId: string,
  fileType: ImportFileTypeValue,
): string {
  return path.join(getImportDir(), `${jobId}.${FILE_CONFIG[fileType].extension}`);
}

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[\u0000-\u001f\u007f]/g, "");
  const safe = base.replace(/[^\w.\- ()]/g, "_").trim();

  return (safe || "import").slice(0, 255);
}

export function validateImportUpload(
  file: { name: string; type: string; size: number },
  buffer: Buffer,
): UploadValidation {
  if (file.size === 0) {
    return { ok: false, status: 400, message: "File kosong" };
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Ukuran file maksimal 10MB",
    };
  }

  const extension = path.extname(file.name).toLowerCase().replace(".", "");
  const matched = (
    Object.entries(FILE_CONFIG) as [
      ImportFileTypeValue,
      (typeof FILE_CONFIG)[ImportFileTypeValue],
    ][]
  ).find(([, config]) => config.extension === extension);

  if (!matched) {
    return {
      ok: false,
      status: 400,
      message: "Format file harus .xlsx, .docx, atau .pdf",
    };
  }

  const [fileType, config] = matched;

  if (file.type !== config.mime) {
    return {
      ok: false,
      status: 400,
      message: "Tipe MIME file tidak sesuai dengan ekstensinya",
    };
  }

  const header = buffer.subarray(0, config.magic.length).toString("latin1");

  if (header !== config.magic) {
    return {
      ok: false,
      status: 400,
      message: "Isi file tidak sesuai dengan format yang dinyatakan",
    };
  }

  return { ok: true, fileType };
}

export async function saveImportFile(
  jobId: string,
  fileType: ImportFileTypeValue,
  buffer: Buffer,
): Promise<void> {
  await mkdir(getImportDir(), { recursive: true });
  await writeFile(importFilePath(jobId, fileType), buffer, { mode: 0o600 });
}

export async function deleteImportFile(
  jobId: string,
  fileType: ImportFileTypeValue,
): Promise<void> {
  try {
    await rm(importFilePath(jobId, fileType), { force: true });
  } catch (error) {
    console.error("[importers/storage] gagal menghapus file import", error);
  }
}
