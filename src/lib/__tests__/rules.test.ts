import { describe, expect, it } from "vitest";

import {
  MIN_DC,
  computeDc,
  computeMaxAttempts,
  computeSuccessProfile,
} from "@/lib/rules";
import type { Inventory } from "@/lib/rules";

const sampleInventory: Inventory = {
  raw: 20,
  fine: 12,
  fused: 6,
  superior: 4,
  supreme: 1,
  rawAE: 9,
};

describe("rules helpers", () => {
  it("keeps salvage odds independent of advantage mode", () => {
    const normal = computeSuccessProfile("T2", "standard", 0, 4, "normal");
    const advantaged = computeSuccessProfile("T2", "standard", 0, 4, "advantage");
    const disadvantaged = computeSuccessProfile("T2", "standard", 0, 4, "disadvantage");

    expect(advantaged.salvageChance).toBe(normal.salvageChance);
    expect(disadvantaged.salvageChance).toBe(normal.salvageChance);
  });

  it("clamps T4 DC using MIN_DC", () => {
    const { dc } = computeDc("T4", "high", 10);
    expect(dc).toBeGreaterThanOrEqual(MIN_DC);
    expect(dc).toBe(MIN_DC);
  });

  it("computes feasible attempts for several tiers", () => {
    const t2 = computeMaxAttempts(sampleInventory, "T2", "standard", 0);
    expect(t2).toBe(10);

    const t3 = computeMaxAttempts(sampleInventory, "T3", "standard", 0);
    // Limited by rawAE: floor(9 / 2) = 4 attempts
    expect(t3).toBe(4);

    const t4 = computeMaxAttempts(sampleInventory, "T4", "high", 2);
    // Costs 1 fused and 2 extra rawAE per attempt => limited by rawAE = floor(9 / 2) = 4
    expect(t4).toBe(4);

    const t5 = computeMaxAttempts(sampleInventory, "T5", "high", 0);
    expect(t5).toBe(2);
  });
});
