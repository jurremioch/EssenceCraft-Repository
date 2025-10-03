export type AdvantageMode = "normal" | "advantage" | "disadvantage";

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

export function chanceWithAdvMode(
  dc: number,
  modifier: number,
  mode: AdvantageMode,
): number {
  const base = chanceNormal(dc, modifier);
  if (mode === "advantage") {
    return clampProbability(1 - (1 - base) * (1 - base));
  }

  if (mode === "disadvantage") {
    return clampProbability(base * base);
  }

  return base;
}

function clampProbability(value: number): number {
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
