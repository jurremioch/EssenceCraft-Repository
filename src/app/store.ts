import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import type { AdvantageMode } from "@/lib/math";
import {
  EMPTY_INVENTORY,
  type Inventory,
  type RiskLevel,
  type TierKey,
} from "@/lib/rules";
import { STORAGE_KEY } from "@/lib/storage";

export const MAX_ROLL_HISTORY = 12;
export const MAX_LOG_ENTRIES = 120;

export type RollMode = "auto" | "manual";

export interface Settings {
  rollMode: RollMode;
  advantage: AdvantageMode;
  modifier: number;
  manualCheckQueue: number[];
  manualSalvageQueue: number[];
}

export interface RollRecord {
  id: string;
  timestamp: string;
  tier: TierKey;
  risk: RiskLevel;
  dc: number;
  raw: number;
  modifier: number;
  total: number;
  success: boolean;
}

export interface RollsState {
  checks: RollRecord[];
  salvages: RollRecord[];
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  tier: TierKey | "system";
  risk?: RiskLevel;
  text: string;
}

export interface NaturalEssenceCraftingState {
  inventory: Inventory;
  settings: Settings;
  log: ActionLogEntry[];
  rolls: RollsState;
  sessionMinutes: number;
  prevInventory: Inventory | null;
  statusMessage: string | null;
}

export interface NaturalEssenceCraftingActions {
  setStatusMessage: (message: string | null) => void;
  clearStatusMessage: () => void;
  setInventoryValue: (key: keyof Inventory, value: number) => void;
  setInventory: (inventory: Inventory) => void;
  snapshotInventory: (inventory?: Inventory) => void;
  restoreInventory: () => boolean;
  clearInventory: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateManualQueue: (type: "check" | "salvage", queue: number[]) => void;
  appendLogEntries: (entries: ActionLogEntry[]) => void;
  commitCraftingResult: (payload: {
    inventory: Inventory;
    checks: RollRecord[];
    salvages: RollRecord[];
    logEntries: ActionLogEntry[];
    manualChecks: number[];
    manualSalvages: number[];
    minutes: number;
  }) => void;
  resetState: () => void;
}

export type NaturalEssenceCraftingStore = NaturalEssenceCraftingState &
  NaturalEssenceCraftingActions;

const createDefaultState = (): NaturalEssenceCraftingState => ({
  inventory: { ...EMPTY_INVENTORY },
  settings: {
    rollMode: "auto",
    advantage: "normal",
    modifier: 0,
    manualCheckQueue: [],
    manualSalvageQueue: [],
  },
  log: [],
  rolls: { checks: [], salvages: [] },
  sessionMinutes: 0,
  prevInventory: null,
  statusMessage: null,
});

const memoryStorage = (() => {
  const storage = new Map<string, string>();
  const api: StateStorage = {
    getItem: (name) => storage.get(name) ?? null,
    setItem: (name, value) => {
      storage.set(name, value);
    },
    removeItem: (name) => {
      storage.delete(name);
    },
  };
  return api;
})();

const storageCreator = () =>
  typeof window !== "undefined" ? window.localStorage : memoryStorage;

export const useNaturalEssenceStore = create<NaturalEssenceCraftingStore>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),
      setStatusMessage: (message) => set({ statusMessage: message }),
      clearStatusMessage: () => set({ statusMessage: null }),
      setInventoryValue: (key, value) =>
        set((state) => ({
          inventory: {
            ...state.inventory,
            [key]: Math.max(0, Math.round(value)),
          },
        })),
      setInventory: (inventory) =>
        set({
          inventory: { ...EMPTY_INVENTORY, ...inventory },
        }),
      snapshotInventory: (inventory) =>
        set((state) => ({
          prevInventory: { ...(inventory ?? state.inventory) },
        })),
      restoreInventory: () => {
        const { prevInventory } = get();
        if (!prevInventory) {
          return false;
        }
        set({ inventory: { ...prevInventory }, prevInventory: null });
        return true;
      },
      clearInventory: () =>
        set((state) => ({
          prevInventory: { ...state.inventory },
          inventory: { ...EMPTY_INVENTORY },
        })),
      updateSettings: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
        })),
      updateManualQueue: (type, queue) =>
        set((state) => ({
          settings: {
            ...state.settings,
            manualCheckQueue:
              type === "check" ? [...queue] : state.settings.manualCheckQueue,
            manualSalvageQueue:
              type === "salvage" ? [...queue] : state.settings.manualSalvageQueue,
          },
        })),
      appendLogEntries: (entries) =>
        set((state) => ({
          log: [...entries, ...state.log].slice(0, MAX_LOG_ENTRIES),
        })),
      commitCraftingResult: ({
        inventory,
        checks,
        salvages,
        logEntries,
        manualChecks,
        manualSalvages,
        minutes,
      }) =>
        set((state) => ({
          inventory: { ...inventory },
          settings: {
            ...state.settings,
            manualCheckQueue: [...manualChecks],
            manualSalvageQueue: [...manualSalvages],
          },
          rolls: {
            checks: [...checks, ...state.rolls.checks].slice(0, MAX_ROLL_HISTORY),
            salvages: [...salvages, ...state.rolls.salvages].slice(
              0,
              MAX_ROLL_HISTORY,
            ),
          },
          log: [...logEntries, ...state.log].slice(0, MAX_LOG_ENTRIES),
          sessionMinutes: state.sessionMinutes + minutes,
        })),
      resetState: () =>
        set({
          ...createDefaultState(),
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(storageCreator),
      partialize: (state) => ({
        inventory: state.inventory,
        settings: state.settings,
        log: state.log,
        rolls: state.rolls,
        sessionMinutes: state.sessionMinutes,
        prevInventory: state.prevInventory,
        statusMessage: state.statusMessage,
      }),
    },
  ),
);

export const getDefaultState = createDefaultState;
