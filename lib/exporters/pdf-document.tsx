import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { fromStoredOptions } from "@/lib/questions/answers";
import {
  DIFFICULTY_LABEL,
  QUESTION_TYPE_LABEL,
} from "@/lib/questions/labels";
import type { QuestionListItem } from "@/lib/questions/query";
import { formatExportDateLong } from "@/lib/exporters/shared";

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 12,
    marginBottom: 16,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 2,
  },
  question: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  number: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    width: 24,
  },
  typeBadge: {
    backgroundColor: "#eef2ff",
    color: "#3730a3",
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 6,
  },
  difficultyBadge: {
    backgroundColor: "#f3f4f6",
    color: "#374151",
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  points: {
    marginLeft: "auto",
    fontSize: 8,
    color: "#6b7280",
  },
  questionText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    lineHeight: 1.45,
    marginBottom: 6,
  },
  optionRow: {
    flexDirection: "row",
    paddingLeft: 24,
    marginBottom: 2,
  },
  optionLabel: {
    width: 14,
    color: "#374151",
  },
  optionText: {
    flex: 1,
    lineHeight: 1.35,
  },
  answer: {
    marginTop: 6,
    paddingLeft: 24,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
    color: "#15803d",
  },
  explanation: {
    marginTop: 4,
    paddingLeft: 24,
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.35,
  },
  empty: {
    marginTop: 24,
    fontSize: 10,
    color: "#6b7280",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
  },
});

type PdfQuestion = {
  options: { label: string; text: string }[];
  answer: string;
};

function pdfQuestionContent(question: QuestionListItem): PdfQuestion {
  const answers = fromStoredOptions(question.type, question.options);

  switch (question.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const correct: string[] = [];
      const options = answers.options
        .slice(0, OPTION_LABELS.length)
        .map((option, index) => {
          const label = OPTION_LABELS[index];

          if (option.isCorrect) {
            correct.push(label);
          }

          return { label, text: option.text };
        });

      return { options, answer: correct.join(", ") };
    }

    case "TRUE_FALSE":
      return {
        options: [],
        answer: answers.correctAnswer ? "Benar" : "Salah",
      };

    case "SHORT_ANSWER":
      return { options: [], answer: answers.correctAnswers.join(" | ") };

    case "ESSAY":
      return { options: [], answer: "Dinilai manual" };
  }
}

export type QuestionsPdfDocumentProps = {
  questions: readonly QuestionListItem[];
  userName: string;
  subjectName?: string | null;
  generatedAt: Date;
};

export function QuestionsPdfDocument({
  questions,
  userName,
  subjectName,
  generatedAt,
}: QuestionsPdfDocumentProps): ReactElement<DocumentProps> {
  const totalPoints = questions.reduce(
    (sum, question) => sum + question.points,
    0,
  );

  return (
    <Document title="Bank Soal" author={userName} language="id">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Bank Soal</Text>
          <Text style={styles.meta}>
            Mata pelajaran: {subjectName ?? "Semua mata pelajaran"}
          </Text>
          <Text style={styles.meta}>Dicetak oleh: {userName}</Text>
          <Text style={styles.meta}>
            {formatExportDateLong(generatedAt)} • {questions.length} soal •{" "}
            {totalPoints} poin
          </Text>
        </View>

        {questions.length === 0 ? (
          <Text style={styles.empty}>
            Tidak ada soal yang cocok dengan filter export.
          </Text>
        ) : (
          questions.map((question, index) => {
            const content = pdfQuestionContent(question);

            return (
              <View key={question.id} style={styles.question}>
                <View style={styles.questionHeader}>
                  <Text style={styles.number}>{index + 1}.</Text>
                  <Text style={styles.typeBadge}>
                    {QUESTION_TYPE_LABEL[question.type]}
                  </Text>
                  <Text style={styles.difficultyBadge}>
                    {DIFFICULTY_LABEL[question.difficulty]}
                  </Text>
                  <Text style={styles.points}>{question.points} poin</Text>
                </View>

                <Text style={styles.questionText}>{question.questionText}</Text>

                {content.options.map((option) => (
                  <View key={option.label} style={styles.optionRow}>
                    <Text style={styles.optionLabel}>{option.label}.</Text>
                    <Text style={styles.optionText}>{option.text}</Text>
                  </View>
                ))}

                <Text style={styles.answer}>Kunci: {content.answer}</Text>

                {question.explanation ? (
                  <Text style={styles.explanation}>
                    Pembahasan: {question.explanation}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Halaman ${pageNumber} dari ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
