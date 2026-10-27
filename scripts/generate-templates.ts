import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as XLSX from "xlsx";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "public", "templates");

function findLibreOffice(): string {
  for (const command of ["libreoffice", "soffice"]) {
    try {
      execFileSync(command, ["--version"], { stdio: "ignore" });
      return command;
    } catch {
      // Coba command berikutnya.
    }
  }

  throw new Error(
    "LibreOffice tidak ditemukan. Pasang libreoffice/soffice atau gunakan README untuk regenerasi manual.",
  );
}

function convert(
  binary: string,
  input: string,
  format: "docx" | "pdf",
  outputDir: string,
): void {
  const profile = pathToFileURL(path.join(outputDir, "lo-profile")).href;

  execFileSync(
    binary,
    [
      "--headless",
      `-env:UserInstallation=${profile}`,
      "--convert-to",
      format,
      "--outdir",
      outputDir,
      input,
    ],
    { stdio: "pipe" },
  );
}

function generateXlsx(): void {
  const header = [
    "subject_code",
    "type",
    "question",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "option_e",
    "correct_answers",
    "points",
    "difficulty",
    "explanation",
  ];

  const rows = [
    [
      "MTK",
      "SINGLE_CHOICE",
      "Hasil dari 2 + 2 adalah ...",
      "3",
      "4",
      "5",
      "6",
      "",
      "B",
      1,
      "EASY",
      "Dua ditambah dua sama dengan empat.",
    ],
    [
      "MTK",
      "MULTIPLE_CHOICE",
      "Manakah yang merupakan bilangan prima kurang dari 10?",
      "2",
      "3",
      "4",
      "5",
      "9",
      "A,B,D",
      2,
      "MEDIUM",
      "Bilangan prima kurang dari 10 adalah 2, 3, 5, dan 7.",
    ],
    [
      "MTK",
      "TRUE_FALSE",
      "7 adalah bilangan prima.",
      "",
      "",
      "",
      "",
      "",
      "true",
      1,
      "EASY",
      "7 hanya habis dibagi 1 dan 7.",
    ],
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 48 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 8 },
    { wch: 12 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "questions");

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Petunjuk Import Soal XLSX"],
    ["1. Isi sheet questions. Jangan mengubah nama header."],
    ["2. subject_code harus sama dengan kode mata pelajaran di aplikasi (contoh: MTK)."],
    ["3. type: SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER, ESSAY."],
    ["4. correct_answers: A untuk single, A,C untuk multiple, true/false untuk benar-salah."],
    ["5. short answer memakai pemisah pipa, contoh: 72|tujuh puluh dua."],
    ["6. points default 1 dan difficulty default MEDIUM jika kosong."],
    ["7. Maksimal 10MB dan 1.000 soal per file."],
  ]);
  instructions["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "petunjuk");

  XLSX.writeFile(workbook, path.join(OUTPUT_DIR, "template-import-soal.xlsx"));
}

function generateDocxAndPdf(binary: string): void {
  const tempDir = mkdtempSync(path.join(tmpdir(), "cbt-template-"));

  try {
    const lines = [
      "1. Ibu kota Indonesia adalah ...",
      "a. Bandung",
      "b. Jakarta",
      "c. Surabaya",
      "d. Medan",
      "Jawaban: B",
      "Pembahasan: Jakarta adalah ibu kota Indonesia.",
      "Poin: 2",
      "Tingkat: EASY",
      "",
      "2. 7 adalah bilangan prima.",
      "Jawaban: true",
      "Pembahasan: 7 hanya habis dibagi 1 dan 7.",
      "Poin: 1",
      "Tingkat: MEDIUM",
    ];

    const textPath = path.join(tempDir, "template.txt");
    writeFileSync(textPath, lines.join("\n"), "utf8");

    // LibreOffice paling stabil mengonversi text/Writer ke DOCX lewat .txt.
    // Jangan gunakan auto-numbering Word agar label "a." tetap literal saat
    // dibaca mammoth.extractRawText().
    convert(binary, textPath, "docx", tempDir);

    const generatedDocx = path.join(tempDir, "template.docx");

    if (!existsSync(generatedDocx)) {
      throw new Error("LibreOffice tidak menghasilkan DOCX");
    }

    copyFileSync(
      generatedDocx,
      path.join(OUTPUT_DIR, "template-import-soal.docx"),
    );

    convert(binary, generatedDocx, "pdf", tempDir);

    const generatedPdf = path.join(tempDir, "template.pdf");

    if (!existsSync(generatedPdf)) {
      throw new Error("LibreOffice tidak menghasilkan PDF");
    }

    copyFileSync(
      generatedPdf,
      path.join(OUTPUT_DIR, "template-import-soal.pdf"),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const binary = findLibreOffice();
  generateXlsx();
  generateDocxAndPdf(binary);

  console.log("Template dibuat:");
  console.log(`- ${path.join(OUTPUT_DIR, "template-import-soal.xlsx")}`);
  console.log(`- ${path.join(OUTPUT_DIR, "template-import-soal.docx")}`);
  console.log(`- ${path.join(OUTPUT_DIR, "template-import-soal.pdf")}`);
}

main();
