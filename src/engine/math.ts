import type { RollMode } from "./types";

export function chanceNormal(dc: number, modifier: number): number {
  const needed = Math.max(1, dc - modifier);
  if (needed <= 1) {
    return 1;
  }

  if (needed > 20) {
    return 0;
  }

  const successes = 21 - Math.ceil(needed);
  return clampProbability(successes / 20);
}

export function chanceWithAdv(dc: number, modifier: number): number {
  const base = chanceNormal(dc, modifier);
  return clampProbability(1 - (1 - base) * (1 - base));
}

export function chanceWithDis(dc: number, modifier: number): number {
  const base = chanceNormal(dc, modifier);
  return clampProbability(base * base);
}

export function chanceForMode(dc: number, modifier: number, mode: RollMode): number {
  if (mode === "adv") {
    return chanceWithAdv(dc, modifier);
  }

  if (mode === "dis") {
    return chanceWithDis(dc, modifier);
  }

  return chanceNormal(dc, modifier);
}

export function applyDcReduction(
  dc: number,
  extra: number,
  perUnit: number,
  min: number,
): number {
  if (extra <= 0) {
    return dc;
  }

  const reduced = dc - perUnit * extra;
  return Math.max(min, reduced);
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export function rollD20(random: () => number = Math.random): number {
  const value = Math.floor(random() * 20) + 1;
  return Math.min(20, Math.max(1, value));
}

export function rollWithMode(mode: RollMode, random: () => number = Math.random): {
  raw: number;
  detail: number[];
} {
  if (mode === "normal") {
    const raw = rollD20(random);
    return { raw, detail: [raw] };
  }

  const first = rollD20(random);
  const second = rollD20(random);
  if (mode === "adv") {
    return { raw: Math.max(first, second), detail: [first, second] };
  }

  return { raw: Math.min(first, second), detail: [first, second] };
}
