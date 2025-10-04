import { describe, expect, it } from "vitest";

import { applyDcReduction, chanceForMode, chanceNormal, chanceWithAdv, chanceWithDis } from "@/engine";

describe("math helpers", () => {
  it("keeps probabilities within range", () => {
    const modes: Array<[string, number]> = [
      ["normal", chanceNormal(10, 5)],
      ["adv", chanceWithAdv(12, 3)],
      ["dis", chanceWithDis(14, 4)],
    ];
    modes.forEach(([, value]) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
    const combined = chanceForMode(15, 2, "adv");
    expect(combined).toBeLessThanOrEqual(1);
    expect(combined).toBeGreaterThanOrEqual(0);
  });

  it("clamps dc reduction at minimum", () => {
    const base = 20;
    const reduced = applyDcReduction(base, 10, 4, 5);
    expect(reduced).toBe(5);
  });
});
