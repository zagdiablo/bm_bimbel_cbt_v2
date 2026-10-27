import { describe, expect, it } from "vitest";

import {
  buildDistribution,
  buildSampleWarnings,
  classifyDifficulty,
  classifyDiscrimination,
  computeDifficultyIndex,
  computeDiscrimination,
  computeSkipRate,
  extremeGroupSize,
  pickExtremeGroups,
  shouldTruncate,
} from "@/lib/analytics/stats";

function choiceOptions() {
  return [
    { label: "A", text: "Opsi A", isCorrect: true },
    { label: "B", text: "Opsi B", isCorrect: false },
    { label: "C", text: "Opsi C", isCorrect: false },
  ];
}

describe("A1u — difficulty index dan klasifikasi", () => {
  it("menghitung p-value dan batas kategori", () => {
    expect(computeDifficultyIndex(3, 5)).toBe(0.6);
    expect(computeDifficultyIndex(0, 5)).toBe(0);
    expect(computeDifficultyIndex(5, 5)).toBe(1);
    expect(computeDifficultyIndex(0, 0)).toBeNull();
    expect(computeDifficultyIndex(2, 0)).toBeNull();

    expect(classifyDifficulty(0.71)).toBe("EASY");
    expect(classifyDifficulty(0.7)).toBe("MEDIUM");
    expect(classifyDifficulty(0.3)).toBe("MEDIUM");
    expect(classifyDifficulty(0.29)).toBe("HARD");
    expect(classifyDifficulty(null)).toBeNull();
  });
});

describe("A2u — 27% split dan discrimination index", () => {
  it("sample < 10 null, floor(27%), grup ekstrem, dan klasifikasi D", () => {
    expect(extremeGroupSize(9)).toBeNull();
    expect(extremeGroupSize(5)).toBeNull();
    expect(extremeGroupSize(2)).toBeNull();
    expect(extremeGroupSize(1)).toBeNull();
    expect(extremeGroupSize(0)).toBeNull();
    expect(extremeGroupSize(10)).toBe(2);
    expect(extremeGroupSize(20)).toBe(5);
    expect(extremeGroupSize(30)).toBe(8);

    const ranked = Array.from({ length: 20 }, (_, index) => ({
      id: `attempt-${index + 1}`,
    }));
    const groups = pickExtremeGroups(ranked);

    expect(groups).not.toBeNull();
    expect(groups?.size).toBe(5);
    expect(groups?.high.map((row) => row.id)).toEqual([
      "attempt-1",
      "attempt-2",
      "attempt-3",
      "attempt-4",
      "attempt-5",
    ]);
    expect(groups?.low.map((row) => row.id)).toEqual([
      "attempt-16",
      "attempt-17",
      "attempt-18",
      "attempt-19",
      "attempt-20",
    ]);
    expect(pickExtremeGroups(ranked.slice(0, 5))).toBeNull();

    const discrimination = computeDiscrimination(4, 5, 1, 5);

    expect(discrimination).toBeCloseTo(0.6, 10);
    expect(classifyDiscrimination(discrimination)).toBe("GOOD");
    expect(classifyDiscrimination(0.3)).toBe("FAIR");
    expect(classifyDiscrimination(0.1)).toBe("FAIR");
    expect(classifyDiscrimination(0.09)).toBe("POOR");
    expect(classifyDiscrimination(-0.4)).toBe("POOR");
    expect(classifyDiscrimination(null)).toBeNull();
    expect(computeDiscrimination(0, 0, 0, 5)).toBeNull();
  });
});

describe("A4u — skip rate dan warning sample", () => {
  it("menghitung skip rate dan warning yang tepat", () => {
    expect(computeSkipRate(2, 5)).toBe(0.4);
    expect(computeSkipRate(0, 5)).toBe(0);
    expect(computeSkipRate(5, 5)).toBe(1);
    expect(computeSkipRate(0, 0)).toBeNull();

    expect(
      buildSampleWarnings({
        gradedTotal: 0,
        invalidAttempts: 0,
        invalidSnapshots: 0,
        truncated: false,
      }),
    ).toEqual(["no_graded_attempts"]);

    expect(
      buildSampleWarnings({
        gradedTotal: 5,
        invalidAttempts: 0,
        invalidSnapshots: 0,
        truncated: false,
      }),
    ).toEqual(["sample_too_small"]);

    expect(
      buildSampleWarnings({
        gradedTotal: 12,
        invalidAttempts: 0,
        invalidSnapshots: 0,
        truncated: false,
      }),
    ).toEqual([]);

    expect(
      buildSampleWarnings({
        gradedTotal: 12,
        invalidAttempts: 2,
        invalidSnapshots: 1,
        truncated: true,
      }),
    ).toEqual([
      "invalid_scores",
      "invalid_snapshot",
      "sample_truncated_at_5000",
    ]);
  });

  it("A15 shouldTruncate memakai batas 5000", () => {
    expect(shouldTruncate(5000)).toBe(false);
    expect(shouldTruncate(5001)).toBe(true);
    expect(shouldTruncate(5001, 5000)).toBe(true);
    expect(shouldTruncate(10, 10)).toBe(false);
  });
});

describe("A3u — distribusi jawaban", () => {
  it("zero-fill, multi-select, bucket non-choice, dan label tak dikenal", () => {
    const distribution = buildDistribution({
      type: "SINGLE_CHOICE",
      options: choiceOptions(),
      labelCounts: new Map([["A", 3]]),
      gradedTotal: 5,
      answeredCount: 3,
      correctCount: 3,
    });

    expect(distribution).toHaveLength(3);
    expect(distribution[0]).toMatchObject({
      key: "A",
      count: 3,
      percentage: 60,
      isCorrect: true,
    });
    expect(distribution[1]).toMatchObject({ key: "B", count: 0 });

    const multi = buildDistribution({
      type: "MULTIPLE_CHOICE",
      options: [
        { label: "A", text: "A", isCorrect: true },
        { label: "B", text: "B", isCorrect: true },
        { label: "C", text: "C", isCorrect: false },
      ],
      labelCounts: new Map([
        ["A", 4],
        ["B", 3],
        ["C", 1],
      ]),
      gradedTotal: 5,
      answeredCount: 5,
      correctCount: 2,
    });

    expect(multi.map((entry) => entry.percentage)).toEqual([80, 60, 20]);
    expect(
      multi.reduce((sum, entry) => sum + (entry.percentage ?? 0), 0),
    ).toBe(160);

    const short = buildDistribution({
      type: "SHORT_ANSWER",
      options: [],
      labelCounts: new Map(),
      gradedTotal: 5,
      answeredCount: 4,
      correctCount: 3,
    });

    expect(short.map((entry) => [entry.key, entry.count])).toEqual([
      ["correct", 3],
      ["incorrect", 1],
      ["skipped", 1],
    ]);

    const essay = buildDistribution({
      type: "ESSAY",
      options: [],
      labelCounts: new Map(),
      gradedTotal: 5,
      answeredCount: 4,
      correctCount: 2,
    });

    expect(essay.map((entry) => [entry.key, entry.count])).toEqual([
      ["scored", 2],
      ["zero", 2],
      ["skipped", 1],
    ]);

    const unknown = buildDistribution({
      type: "TRUE_FALSE",
      options: [
        { label: "A", text: "Benar", isCorrect: true },
        { label: "B", text: "Salah", isCorrect: false },
      ],
      labelCounts: new Map([
        ["A", 1],
        ["Z", 1],
      ]),
      gradedTotal: 2,
      answeredCount: 2,
      correctCount: 1,
    });

    expect(unknown.map((entry) => entry.key)).toEqual(["A", "B", "Z"]);
  });
});
