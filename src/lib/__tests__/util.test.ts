import { describe, expect, it } from "vitest";

import { clampInt, d20, parseCSVInts } from "@/lib/util";

describe("parseCSVInts", () => {
  it("parses comma and whitespace separated values", () => {
    expect(parseCSVInts("1, 2,3\n4")).toEqual([1, 2, 3, 4]);
  });

  it("ignores empty and invalid tokens", () => {
    expect(parseCSVInts("5, , apple, -2"))
      .toEqual([5, -2]);
  });
});

describe("clampInt", () => {
  it("clamps values within bounds and rounds", () => {
    expect(clampInt(4.6, 0, 10)).toBe(5);
    expect(clampInt(-5, 0, 10)).toBe(0);
    expect(clampInt(50, 0, 10)).toBe(10);
  });
});

describe("d20", () => {
  it("produces values between 1 and 20", () => {
    const roll = d20(() => 0.5);
    expect(roll).toBeGreaterThanOrEqual(1);
    expect(roll).toBeLessThanOrEqual(20);
  });
});
