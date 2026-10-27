import {
  difficultySchema,
  questionTypeSchema,
  type DifficultyValue,
  type QuestionOptionInput,
  type QuestionTypeValue,
} from "@/lib/zod-schemas/question";

import {
  emptyParseResult,
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_IMPORT_QUESTIONS,
  type ParseResult,
  type ParsedQuestion,
  type SubjectLookup,
} from "./types";
import {
  hasDuplicateStrings,
  parseBooleanAnswer,
  parseChoiceLabels,
  parsePipeAnswers,
  validateQuestionCandidate,
} from "./validate";

type RawOption = {
  label: string;
  text: string;
};

type RawBlock = {
  number: number;
  lines: string[];
};

type ActiveField =
  | "question"
  | "answer"
  | "explanation"
  | "points"
  | "difficulty"
  | "type"
  | null;

type ParsedBlockFields = {
  questionText: string;
  options: RawOption[];
  answer: string;
  explanation: string;
  pointsRaw: string;
  difficultyRaw: string;
  typeRaw: string;
  errors: string[];
};

const QUESTION_RE = /^(\d+)[.)]\s*(.*)$/;
const OPTION_RE = /^([a-e])[.)]\s+(.+)$/i;
const METADATA_RE = /^(tipe|jawaban|pembahasan|poin|tingkat)\s*:\s*(.*)$/i;

function splitBlocks(text: string): RawBlock[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;

  for (const line of lines) {
    const match = line.match(QUESTION_RE);

    if (match) {
      if (current) {
        blocks.push(current);
      }

      current = {
        number: Number.parseInt(match[1], 10),
        lines: match[2] ? [match[2]] : [],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function readBlock(block: RawBlock): ParsedBlockFields {
  const questionLines: string[] = [];
  const options: RawOption[] = [];
  let answer = "";
  let explanation = "";
  let pointsRaw = "";
  let difficultyRaw = "";
  let typeRaw = "";
  let activeField: ActiveField = "question";
  let activeOption: number | null = null;

  function appendContinuation(line: string) {
    if (activeOption !== null) {
      const option = options[activeOption];

      if (option) {
        option.text = `${option.text} ${line}`.trim();
      }
      return;
    }

    switch (activeField) {
      case "answer":
        answer = `${answer} ${line}`.trim();
        break;
      case "explanation":
        explanation = `${explanation}\n${line}`.trim();
        break;
      case "points":
        pointsRaw = `${pointsRaw} ${line}`.trim();
        break;
      case "difficulty":
        difficultyRaw = `${difficultyRaw} ${line}`.trim();
        break;
      case "type":
        typeRaw = `${typeRaw} ${line}`.trim();
        break;
      case "question":
      default:
        questionLines.push(line);
        break;
    }
  }

  for (const line of block.lines) {
    const metadata = line.match(METADATA_RE);

    if (metadata) {
      const key = metadata[1].toLowerCase();
      const value = metadata[2].trim();
      activeOption = null;

      switch (key) {
        case "tipe":
          typeRaw = value;
          activeField = "type";
          break;
        case "jawaban":
          answer = value;
          activeField = "answer";
          break;
        case "pembahasan":
          explanation = value;
          activeField = "explanation";
          break;
        case "poin":
          pointsRaw = value;
          activeField = "points";
          break;
        case "tingkat":
          difficultyRaw = value;
          activeField = "difficulty";
          break;
      }

      continue;
    }

    const option = line.match(OPTION_RE);

    if (option) {
      options.push({
        label: option[1].toUpperCase(),
        text: option[2].trim(),
      });
      activeOption = options.length - 1;
      activeField = null;
      continue;
    }

    appendContinuation(line);
  }

  return {
    questionText: questionLines.join("\n").trim(),
    options,
    answer: answer.trim(),
    explanation: explanation.trim(),
    pointsRaw: pointsRaw.trim(),
    difficultyRaw: difficultyRaw.trim(),
    typeRaw: typeRaw.trim(),
    errors: [],
  };
}

function optionInputs(rawOptions: readonly RawOption[]): QuestionOptionInput[] {
  return rawOptions.map((option) => ({
    label: option.label,
    text: option.text.trim(),
    isCorrect: false,
  }));
}

function resolveExplicitType(value: string): QuestionTypeValue | null {
  if (!value) {
    return null;
  }

  const parsed = questionTypeSchema.safeParse(value.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

function resolveDifficulty(value: string): DifficultyValue | null {
  const parsed = difficultySchema.safeParse(
    (value || "MEDIUM").trim().toUpperCase(),
  );
  return parsed.success ? parsed.data : null;
}

function inferType(
  answer: string,
  options: readonly QuestionOptionInput[],
): { type: QuestionTypeValue | null; errors: string[] } {
  if (!answer) {
    return {
      type: null,
      errors: ["Jawaban wajib diisi (kecuali gunakan Tipe: ESSAY)"],
    };
  }

  if (parseBooleanAnswer(answer) !== null) {
    return { type: "TRUE_FALSE", errors: [] };
  }

  if (options.length >= 2) {
    const labels = parseChoiceLabels(answer);

    if (
      labels.length === 0 ||
      labels.some((label) => !/^[A-E]$/.test(label))
    ) {
      return {
        type: null,
        errors: [
          "Jawaban harus berupa label opsi (contoh: A atau A,C)",
        ],
      };
    }

    return {
      type: labels.length === 1 ? "SINGLE_CHOICE" : "MULTIPLE_CHOICE",
      errors: [],
    };
  }

  return {
    type: null,
    errors: [
      "Tipe soal tidak dapat ditentukan. Tambahkan Tipe: SHORT_ANSWER atau Tipe: ESSAY.",
    ],
  };
}

function buildCandidate(
  type: QuestionTypeValue,
  base: {
    subjectId: string;
    questionText: string;
    explanation: string;
    difficulty: DifficultyValue;
    points: number;
  },
  fields: ParsedBlockFields,
  options: readonly QuestionOptionInput[],
  errors: string[],
): Record<string, unknown> | null {
  const candidate: Record<string, unknown> = {
    subjectId: base.subjectId,
    type,
    questionText: base.questionText,
    difficulty: base.difficulty,
    points: base.points,
    ...(base.explanation ? { explanation: base.explanation } : {}),
  };

  switch (type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      if (options.length < 2) {
        errors.push("Minimal 2 opsi jawaban");
        return null;
      }

      const labels = parseChoiceLabels(fields.answer);

      if (labels.length === 0) {
        errors.push("Jawaban wajib diisi");
        return null;
      }

      if (hasDuplicateStrings(labels, false)) {
        errors.push("Label jawaban tidak boleh duplikat");
        return null;
      }

      const availableLabels = new Set(options.map((option) => option.label));

      for (const label of labels) {
        if (!availableLabels.has(label)) {
          errors.push(`Label jawaban ${label} tidak ada di opsi`);
        }
      }

      if (type === "SINGLE_CHOICE" && labels.length !== 1) {
        errors.push("Pilihan ganda tunggal harus punya tepat 1 jawaban");
      }

      if (type === "MULTIPLE_CHOICE" && labels.length < 1) {
        errors.push("Pilihan ganda kompleks minimal punya 1 jawaban");
      }

      if (errors.length > 0) {
        return null;
      }

      candidate.options = options.map((option) => ({
        ...option,
        isCorrect: labels.includes(option.label),
      }));
      break;
    }

    case "TRUE_FALSE": {
      if (options.length > 0) {
        errors.push("TRUE_FALSE tidak memakai opsi a-e");
        return null;
      }

      const correctAnswer = parseBooleanAnswer(fields.answer);

      if (correctAnswer === null) {
        errors.push("Jawaban TRUE_FALSE harus true/false/benar/salah");
        return null;
      }

      candidate.correctAnswer = correctAnswer;
      break;
    }

    case "SHORT_ANSWER": {
      if (fields.answer && options.length > 0) {
        errors.push(
          "Kontradiksi: gunakan Jawaban: ATAU opsi a-e, tidak keduanya",
        );
        return null;
      }

      const answers = fields.answer
        ? parsePipeAnswers(fields.answer)
        : options.map((option) => option.text);

      if (answers.length === 0) {
        errors.push("SHORT_ANSWER harus punya Jawaban: atau opsi a-e");
        return null;
      }

      if (hasDuplicateStrings(answers)) {
        errors.push("Jawaban benar tidak boleh duplikat");
        return null;
      }

      candidate.correctAnswers = answers;
      break;
    }

    case "ESSAY": {
      if (fields.answer) {
        errors.push("ESSAY tidak memakai Jawaban:");
        return null;
      }

      if (options.length > 0) {
        errors.push("ESSAY tidak memakai opsi a-e");
        return null;
      }
      break;
    }
  }

  if (errors.length > 0) {
    return null;
  }

  return candidate;
}

function parseBlock(
  block: RawBlock,
  subjects: SubjectLookup,
): ParsedQuestion {
  const fields = readBlock(block);
  const errors: string[] = [];
  const subjectId = subjects.defaultSubjectId;

  if (!subjectId) {
    errors.push("Mata pelajaran belum dipilih");
  }

  if (!fields.questionText) {
    errors.push("Teks soal wajib diisi");
  }

  const difficulty = resolveDifficulty(fields.difficultyRaw);

  if (!difficulty) {
    errors.push("Tingkat harus EASY, MEDIUM, atau HARD");
  }

  const points = fields.pointsRaw ? Number(fields.pointsRaw) : 1;

  if (!Number.isFinite(points)) {
    errors.push("Poin harus berupa angka");
  }

  const options = optionInputs(fields.options);

  if (hasDuplicateStrings(options.map((option) => option.label), false)) {
    errors.push("Label opsi tidak boleh duplikat");
  }

  let type = resolveExplicitType(fields.typeRaw);

  if (fields.typeRaw && !type) {
    errors.push("Tipe soal tidak dikenal");
  }

  if (!type) {
    const inferred = inferType(fields.answer, options);
    type = inferred.type;
    errors.push(...inferred.errors);
  }

  if (!type || !subjectId || !difficulty) {
    return { rowNumber: block.number, data: null, errors };
  }

  const candidate = buildCandidate(
    type,
    {
      subjectId,
      questionText: fields.questionText,
      explanation: fields.explanation,
      difficulty,
      points,
    },
    fields,
    options,
    errors,
  );

  if (!candidate) {
    return {
      rowNumber: block.number,
      data: null,
      errors: errors.length > 0 ? errors : ["Data soal tidak valid"],
    };
  }

  if (errors.length > 0) {
    return { rowNumber: block.number, data: null, errors };
  }

  const validated = validateQuestionCandidate(candidate);

  return {
    rowNumber: block.number,
    data: validated.data,
    errors: validated.errors,
  };
}

/**
 * Parser blok bersama DOCX/PDF. Format ini sengaja heuristic: nomor soal,
 * opsi a-e, dan metadata case-insensitive. Limitasi didokumentasikan di
 * README (auto-numbering Word, OCR, dan nomor soal literal).
 */
export function parseBlocks(
  text: string,
  subjects: SubjectLookup,
): ParseResult {
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    return emptyParseResult(
      "Teks dokumen terlalu panjang untuk diproses (maksimal 2 juta karakter)",
    );
  }

  const blocks = splitBlocks(text);

  if (blocks.length === 0) {
    return emptyParseResult(
      "Tidak ada soal bernomor yang ditemukan. Gunakan format 1. Soal ...",
    );
  }

  if (blocks.length > MAX_IMPORT_QUESTIONS) {
    return emptyParseResult(
      `Maksimal ${MAX_IMPORT_QUESTIONS} soal per file`,
    );
  }

  return {
    questions: blocks.map((block) => parseBlock(block, subjects)),
    globalErrors: [],
  };
}
