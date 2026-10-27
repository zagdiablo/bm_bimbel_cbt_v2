import { randomInt as cryptoRandomInt } from "node:crypto";

export type RandomInt = (min: number, max: number) => number;

/**
 * Fisher-Yates in-place. RNG bisa di-inject agar unit test deterministik.
 * `randomInt(min, max)` harus mengembalikan integer di [min, max).
 */
export function shuffleInPlace<T>(
  items: T[],
  randomInt: RandomInt = cryptoRandomInt,
): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    const current = items[index];

    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }

  return items;
}

export function shuffledCopy<T>(
  items: readonly T[],
  randomInt: RandomInt = cryptoRandomInt,
): T[] {
  return shuffleInPlace([...items], randomInt);
}
