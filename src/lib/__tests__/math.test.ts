import { describe, expect, it } from "vitest";

import { chanceNormal, chanceWithAdvMode } from "@/lib/math";

describe("chance calculations", () => {
  it("returns probabilities within [0, 1]", () => {
    const modes: Array<[number, number, "normal" | "advantage" | "disadvantage"]> = [
      [10, 0, "normal"],
      [15, 3, "advantage"],
      [20, -2, "disadvantage"],
    ];

    for (const [dc, modifier, mode] of modes) {
      const normal = chanceNormal(dc, modifier);
      const adv = chanceWithAdvMode(dc, modifier, mode);
      expect(normal).toBeGreaterThanOrEqual(0);
      expect(normal).toBeLessThanOrEqual(1);
      expect(adv).toBeGreaterThanOrEqual(0);
      expect(adv).toBeLessThanOrEqual(1);
    }
  });

  it("is monotonic with respect to the modifier", () => {
    const dc = 15;
    const low = chanceNormal(dc, 0);
    const mid = chanceNormal(dc, 2);
    const high = chanceNormal(dc, 5);

    expect(mid).toBeGreaterThanOrEqual(low);
    expect(high).toBeGreaterThanOrEqual(mid);
  });
});
