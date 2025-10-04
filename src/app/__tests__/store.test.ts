import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_LOG_ENTRIES,
  MAX_ROLL_HISTORY,
  type ActionLogEntry,
  type RollRecord,
  useNaturalEssenceStore,
} from "@/app/store";

const timestamp = () => new Date().toISOString();

const createRoll = (id: string, success = true): RollRecord => ({
  id,
  timestamp: timestamp(),
  tier: "T2",
  risk: "standard",
  dc: 15,
  raw: 12,
  modifier: 3,
  total: 15,
  success,
});

const createEntry = (id: string): ActionLogEntry => ({
  id,
  timestamp: timestamp(),
  tier: "T2",
  risk: "standard",
  text: `Entry ${id}`,
});

describe("natural essence store", () => {
  beforeEach(() => {
    useNaturalEssenceStore.persist.clearStorage?.();
    useNaturalEssenceStore.getState().resetState();
  });

  it("clamps inventory changes to non-negative integers", () => {
    const store = useNaturalEssenceStore.getState();

    store.setInventoryValue("raw", 4.7);
    expect(useNaturalEssenceStore.getState().inventory.raw).toBe(5);

    store.setInventoryValue("raw", -12);
    expect(useNaturalEssenceStore.getState().inventory.raw).toBe(0);
  });

  it("restores the most recent inventory snapshot", () => {
    const store = useNaturalEssenceStore.getState();
    store.setInventoryValue("raw", 8);
    store.snapshotInventory();
    store.setInventoryValue("raw", 2);

    expect(useNaturalEssenceStore.getState().inventory.raw).toBe(2);

    const restored = store.restoreInventory();
    expect(restored).toBe(true);
    expect(useNaturalEssenceStore.getState().inventory.raw).toBe(8);

    const secondRestore = store.restoreInventory();
    expect(secondRestore).toBe(false);
  });

  it("commits crafting results and trims history", () => {
    const existingChecks = Array.from({ length: MAX_ROLL_HISTORY - 1 }, (_, index) =>
      createRoll(`existing-check-${index}`),
    );
    const existingSalvages = Array.from({ length: MAX_ROLL_HISTORY - 1 }, (_, index) =>
      createRoll(`existing-salvage-${index}`, false),
    );
    const existingEntries = Array.from({ length: MAX_LOG_ENTRIES - 1 }, (_, index) =>
      createEntry(`existing-${index}`),
    );

    useNaturalEssenceStore.setState({
      rolls: { checks: existingChecks, salvages: existingSalvages },
      log: existingEntries,
      sessionMinutes: 9,
    });

    const newChecks = [createRoll("new-check-1"), createRoll("new-check-0")];
    const newSalvages = [createRoll("new-salvage-0", false)];
    const newEntries = [createEntry("new-log-1"), createEntry("new-log-0")];
    const manualChecks = [18, 4];
    const manualSalvages = [7];

    const nextInventory = {
      ...useNaturalEssenceStore.getState().inventory,
      raw: 3,
    };

    useNaturalEssenceStore
      .getState()
      .commitCraftingResult({
        inventory: nextInventory,
        checks: newChecks,
        salvages: newSalvages,
        logEntries: newEntries,
        manualChecks,
        manualSalvages,
        minutes: 12,
      });

    const state = useNaturalEssenceStore.getState();

    expect(state.inventory).not.toBe(nextInventory);
    expect(state.inventory.raw).toBe(3);
    expect(state.settings.manualCheckQueue).toEqual(manualChecks);
    expect(state.settings.manualCheckQueue).not.toBe(manualChecks);
    expect(state.settings.manualSalvageQueue).toEqual(manualSalvages);
    expect(state.settings.manualSalvageQueue).not.toBe(manualSalvages);
    expect(state.sessionMinutes).toBe(21);

    expect(state.rolls.checks.length).toBe(MAX_ROLL_HISTORY);
    expect(state.rolls.checks[0].id).toBe("new-check-1");
    expect(state.rolls.checks[1].id).toBe("new-check-0");
    expect(state.rolls.checks.slice(2).map((roll) => roll.id)).toEqual(
      existingChecks.slice(0, MAX_ROLL_HISTORY - 2).map((roll) => roll.id),
    );

    expect(state.rolls.salvages.length).toBe(MAX_ROLL_HISTORY);
    expect(state.rolls.salvages[0].id).toBe("new-salvage-0");
    expect(state.rolls.salvages.slice(1).map((roll) => roll.id)).toEqual(
      existingSalvages.slice(0, MAX_ROLL_HISTORY - 1).map((roll) => roll.id),
    );

    expect(state.log.length).toBe(MAX_LOG_ENTRIES);
    expect(state.log[0].id).toBe("new-log-1");
    expect(state.log[1].id).toBe("new-log-0");
    expect(state.log[2].id).toBe("existing-0");
  });

  it("prepends log entries while enforcing the cap", () => {
    const existingEntries = Array.from({ length: MAX_LOG_ENTRIES - 2 }, (_, index) =>
      createEntry(`existing-${index}`),
    );

    useNaturalEssenceStore.setState({ log: existingEntries });

    useNaturalEssenceStore.getState().appendLogEntries([
      createEntry("new-a"),
      createEntry("new-b"),
      createEntry("new-c"),
    ]);

    const { log } = useNaturalEssenceStore.getState();
    expect(log.length).toBe(MAX_LOG_ENTRIES);
    expect(log.slice(0, 3).map((entry) => entry.id)).toEqual(["new-a", "new-b", "new-c"]);
    expect(log[3].id).toBe("existing-0");
  });
});
