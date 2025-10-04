import { describe, expect, it } from "vitest";

import { maxFeasibleAttempts, simulateAttempt, simulateBatch } from "@/engine";

import { naturalFamily } from "./rules";

const RESOURCES = ["raw", "fine", "fused", "superior", "supreme", "rawAE"] as const;

type Inventory = Record<(typeof RESOURCES)[number], number>;

function inventory(partial: Partial<Inventory> = {}): Inventory {
  const base: Inventory = { raw: 0, fine: 0, fused: 0, superior: 0, supreme: 0, rawAE: 0 };
  return { ...base, ...partial };
}

function getAction(id: string) {
  const action = naturalFamily.actions.find((item) => item.id === id);
  if (!action) {
    throw new Error(`Missing action ${id}`);
  }
  return action;
}

function generator(values: number[]): () => number {
  const queue = [...values];
  return () => {
    const value = queue.shift();
    if (value === undefined) {
      return Math.random();
    }
    return value;
  };
}

describe("natural family rules", () => {
  it("clamps T4 feasibility by extra RawAE", () => {
    const action = getAction("natural.T4.refine");
    const inv = inventory({ fused: 10, rawAE: 5 });
    const max = maxFeasibleAttempts(action, inv, "standard", 3);
    expect(max).toBe(1);
  });

  it("stops batch when resources are exhausted", () => {
    const action = getAction("natural.T2.refine");
    const inv = inventory({ raw: 5 });
    const batch = simulateBatch(
      {
        action,
        inventory: inv,
        modifier: 0,
        mode: "normal",
        risk: "low",
      },
      3,
    );
    expect(batch.attempts).toHaveLength(1);
    expect(batch.summary.runs).toBe(1);
  });

  it("rolls salvage only on failure and uses single d20", () => {
    const action = getAction("natural.T2.refine");
    const inv = inventory({ raw: 5 });

    const failing = simulateAttempt({
      action,
      inventory: inv,
      modifier: 0,
      mode: "adv",
      risk: "standard",
      random: generator([0, 0.05]),
      salvageRandom: generator([0.94]),
    });
    expect(failing.check?.success).toBe(false);
    expect(failing.salvage?.attempted).toBe(true);
    expect(failing.salvage?.raw).toBe(19);

    const succeeding = simulateAttempt({
      action,
      inventory: inv,
      modifier: 10,
      mode: "dis",
      risk: "standard",
      random: generator([0.95, 0.9]),
      salvageRandom: generator([0.25]),
    });
    expect(succeeding.check?.success).toBe(true);
    expect(succeeding.salvage?.attempted).toBe(false);
  });

  it("produces correct inventory deltas", () => {
    const t2 = getAction("natural.T2.refine");
    const t3 = getAction("natural.T3.infuse");
    const t4 = getAction("natural.T4.refine");
    const t5 = getAction("natural.T5.refine");

    const success = simulateAttempt({
      action: t2,
      inventory: inventory({ raw: 4 }),
      modifier: 20,
      mode: "normal",
      risk: "standard",
      random: generator([0.5]),
    });
    expect(success.delta).toMatchObject({ raw: -2, fine: 1 });

    const failWithSalvage = simulateAttempt({
      action: t3,
      inventory: inventory({ fine: 2, rawAE: 2 }),
      modifier: 0,
      mode: "normal",
      risk: "standard",
      random: generator([0]),
      salvageRandom: generator([0.9]),
    });
    expect(failWithSalvage.check?.success).toBe(false);
    expect(failWithSalvage.salvage?.success).toBe(true);
    expect(failWithSalvage.delta).toMatchObject({ fine: 0, rawAE: -2 });

    const t4Result = simulateAttempt({
      action: t4,
      inventory: inventory({ fused: 3, rawAE: 4 }),
      modifier: 20,
      mode: "normal",
      risk: "standard",
      extraCatalyst: 2,
      random: generator([0.5]),
    });
    expect(t4Result.delta).toMatchObject({ fused: -2, rawAE: -2, superior: 1 });

    const t5Result = simulateAttempt({
      action: t5,
      inventory: inventory({ superior: 3 }),
      modifier: 0,
      mode: "normal",
      risk: "high",
      random: generator([0]),
      salvageRandom: generator([0]),
    });
    expect(t5Result.delta.superior).toBeLessThanOrEqual(0);
  });
});
