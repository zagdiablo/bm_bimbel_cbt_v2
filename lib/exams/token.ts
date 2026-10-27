import { randomInt } from "node:crypto";

/**
 * Alphabet sengaja membuang I, O, 0, dan 1 agar token mudah dibaca ulang.
 * Sisa 24 huruf + 8 digit = 32 karakter.
 */
export const EXAM_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const EXAM_TOKEN_LENGTH = 6;

export function generateExamToken(length = EXAM_TOKEN_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("Panjang token harus bilangan bulat positif");
  }

  let token = "";

  for (let index = 0; index < length; index += 1) {
    token += EXAM_TOKEN_ALPHABET[randomInt(0, EXAM_TOKEN_ALPHABET.length)];
  }

  return token;
}

export function normalizeExamToken(value: string): string {
  return value.trim().toUpperCase();
}

export function isExamToken(value: string): boolean {
  return new RegExp(`^[${EXAM_TOKEN_ALPHABET}]+$`).test(value);
}
