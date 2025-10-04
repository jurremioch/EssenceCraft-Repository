import { useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import type { BatchResult, Risk, RollMode } from "@/engine";

export const MAX_ROLL_HISTORY = 12;
export const MAX_LOG_ENTRIES = 120;

export type RollResolutionMode = "auto" | "manual";

export interface DiceFace {
  id: string;
  label: string;
  raw: number;
  total: number;
  dc: number;
  success: boolean;
}

export interface CraftingSettings {
  rollResolution: RollResolutionMode;
  rollMode: RollMode;
  modifier: number;
  manualCheckQueue: number[];
  manualSalvageQueue: number[];
  showDiceOverlay: boolean;
}

export interface RollRecord {
  id: string;
  timestamp: string;
  familyId: string;
  actionId: string;
  actionName: string;
  risk?: Risk;
  dc: number;
  raw: number;
  modifier: number;
  total: number;
  success: boolean;
  mode: RollMode;
}

export interface SalvageRecord {
  id: string;
  timestamp: string;
  familyId: string;
  actionId: string;
  actionName: string;
  risk?: Risk;
  dc?: number;
  raw: number;
  modifier: number;
  total: number;
  success: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  familyId: string;
  actionId: string;
  actionName: string;
  risk?: Risk;
  message: string;
}

export interface CraftingState {
  activeFamilyId: string;
  inventory: Record<string, number>;
  prevInventory: Record<string, number> | null;
  log: LogEntry[];
  rolls: {
    checks: RollRecord[];
    salvages: SalvageRecord[];
  };
  overlayFaces: DiceFace[] | null;
  sessionMinutes: number;
  settings: CraftingSettings;
  statusMessage: string | null;
}

export interface CraftingActions {
  setActiveFamily: (familyId: string) => void;
  setInventoryValue: (resource: string, value: number) => void;
  setInventory: (inventory: Record<string, number>) => void;
  snapshotInventory: (inventory?: Record<string, number>) => void;
  restoreInventory: () => boolean;
  clearInventory: () => void;
  updateSettings: (patch: Partial<CraftingSettings>) => void;
  updateManualQueue: (type: "check" | "salvage", values: number[]) => void;
  setOverlayFaces: (faces: DiceFace[] | null) => void;
  appendLogEntries: (entries: LogEntry[]) => void;
  commitBatchResult: (payload: {
    familyId: string;
    actionId: string;
    actionName: string;
    risk?: Risk;
    batch: BatchResult;
    manualCheckQueue: number[];
    manualSalvageQueue: number[];
  }) => void;
  setStatusMessage: (message: string | null) => void;
  clearStatusMessage: () => void;
  resetState: () => void;
}

export type CraftingStore = CraftingState & CraftingActions;

const DEFAULT_SETTINGS: CraftingSettings = {
  rollResolution: "auto",
  rollMode: "normal",
  modifier: 0,
  manualCheckQueue: [],
  manualSalvageQueue: [],
  showDiceOverlay: true,
};

const createDefaultState = (): CraftingState => ({
  activeFamilyId: "natural",
  inventory: {},
  prevInventory: null,
  log: [],
  rolls: { checks: [], salvages: [] },
  overlayFaces: null,
  sessionMinutes: 0,
  settings: { ...DEFAULT_SETTINGS },
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

const useClientLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const STORAGE_KEY = "essencecraft:v2";

export const useCraftingStore = create<CraftingStore>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),
      setActiveFamily: (familyId) =>
        set((state) => ({
          activeFamilyId: familyId,
          inventory: { ...state.inventory },
        })),
      setInventoryValue: (resource, value) =>
        set((state) => ({
          inventory: {
            ...state.inventory,
            [resource]: Math.max(0, Math.round(Number.isNaN(value) ? 0 : value)),
          },
        })),
      setInventory: (inventory) =>
        set(() => ({
          inventory: { ...inventory },
        })),
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
          inventory: {},
        })),
      updateSettings: (patch) =>
        set((state) => ({
          settings: { ...state.settings, ...patch },
        })),
      updateManualQueue: (type, values) =>
        set((state) => ({
          settings: {
            ...state.settings,
            manualCheckQueue:
              type === "check" ? [...values] : [...state.settings.manualCheckQueue],
            manualSalvageQueue:
              type === "salvage" ? [...values] : [...state.settings.manualSalvageQueue],
          },
        })),
      setOverlayFaces: (faces) => set({ overlayFaces: faces }),
      appendLogEntries: (entries) =>
        set((state) => ({
          log: [...entries, ...state.log].slice(0, MAX_LOG_ENTRIES),
        })),
      commitBatchResult: ({
        familyId,
        actionId,
        actionName,
        risk,
        batch,
        manualCheckQueue,
        manualSalvageQueue,
      }) =>
        set((state) => {
          const newLogEntries: LogEntry[] = [];
          const newChecks: RollRecord[] = [];
          const newSalvages: SalvageRecord[] = [];

          batch.attempts.forEach((attempt, index) => {
            if (!attempt.check) return;
            const attemptTimestamp = new Date().toISOString();
            newLogEntries.push({
              id: `${attemptTimestamp}-${index}`,
              timestamp: attemptTimestamp,
              familyId,
              actionId,
              actionName,
              risk,
              message: formatLogMessage(
                attempt.delta,
                attempt.check.success,
                attempt.salvage,
                attempt.salvageProduced,
              ),
            });
            newChecks.push({
              id: `${attemptTimestamp}-check-${index}`,
              timestamp: attemptTimestamp,
              familyId,
              actionId,
              actionName,
              risk,
              dc: attempt.check.dc,
              raw: attempt.check.raw,
              modifier: attempt.check.modifier,
              total: attempt.check.total,
              success: attempt.check.success,
              mode: attempt.check.mode,
            });
            if (attempt.salvage?.attempted && attempt.salvage.raw !== undefined) {
              newSalvages.push({
                id: `${attemptTimestamp}-salvage-${index}`,
                timestamp: attemptTimestamp,
                familyId,
                actionId,
                actionName,
                risk,
                dc: attempt.salvage.dc,
                raw: attempt.salvage.raw,
                modifier: attempt.salvage.modifier,
                total: attempt.salvage.total ?? 0,
                success: attempt.salvage.success ?? false,
              });
            }
          });

          return {
            inventory: { ...batch.finalInventory },
            log: [...newLogEntries, ...state.log].slice(0, MAX_LOG_ENTRIES),
            rolls: {
              checks: [...newChecks, ...state.rolls.checks].slice(0, MAX_ROLL_HISTORY),
              salvages: [...newSalvages, ...state.rolls.salvages].slice(0, MAX_ROLL_HISTORY),
            },
            settings: {
              ...state.settings,
              manualCheckQueue: [...manualCheckQueue],
              manualSalvageQueue: [...manualSalvageQueue],
            },
            sessionMinutes: state.sessionMinutes + batch.summary.totalMinutes,
            statusMessage: batch.summary.runs
              ? `${batch.summary.runs} attempt${batch.summary.runs === 1 ? "" : "s"} completed`
              : state.statusMessage,
            overlayFaces: state.settings.showDiceOverlay
              ? createOverlayFaces(actionName, risk, batch)
              : state.overlayFaces,
          };
        }),
      setStatusMessage: (message) => set({ statusMessage: message }),
      clearStatusMessage: () => set({ statusMessage: null }),
      resetState: () => set(createDefaultState()),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(storageCreator),
      version: 1,
    },
  ),
);

export function useResetStoreOnMissingPersistedState() {
  useClientLayoutEffect(() => {
    const storage = storageCreator();
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) {
      useCraftingStore.getState().resetState();
    }
  }, []);
}

function formatLogMessage(
  delta: Record<string, number>,
  success: boolean,
  salvage?: { success?: boolean },
  salvageProduced?: Record<string, number>,
): string {
  const netChange = formatDeltaRecord(delta);
  if (success) {
    return `Success · ${netChange}`;
  }
  if (salvage?.success) {
    const salvageDelta = formatDeltaRecord(salvageProduced ?? {});
    return `Failed · Salvaged ${salvageDelta} (net ${netChange})`;
  }
  return `Failed · ${netChange}`;
}

function formatDeltaRecord(record: Record<string, number>): string {
  const parts = Object.entries(record)
    .filter(([, amount]) => amount !== 0)
    .map(([resource, amount]) => `${amount > 0 ? "+" : ""}${amount} ${resource}`);
  return parts.length ? parts.join(", ") : "no change";
}

function createOverlayFaces(
  actionName: string,
  risk: Risk | undefined,
  batch: BatchResult,
): DiceFace[] | null {
  const lastAttempt = batch.attempts[batch.attempts.length - 1];
  if (!lastAttempt?.check) {
    return null;
  }
  const label = risk ? `${actionName} (${risk})` : actionName;
  const faces: DiceFace[] = [
    {
      id: `${lastAttempt.check.dc}-${lastAttempt.check.raw}-${Math.random()}`,
      label,
      raw: lastAttempt.check.raw,
      total: lastAttempt.check.total,
      dc: lastAttempt.check.dc,
      success: lastAttempt.check.success,
    },
  ];
  if (lastAttempt.salvage?.attempted && lastAttempt.salvage.raw !== undefined) {
    faces.push({
      id: `${lastAttempt.salvage.dc}-${lastAttempt.salvage.raw}-${Math.random()}`,
      label: `${label} · Salvage`,
      raw: lastAttempt.salvage.raw,
      total: lastAttempt.salvage.total ?? 0,
      dc: lastAttempt.salvage.dc ?? 0,
      success: lastAttempt.salvage.success ?? false,
    });
  }
  return faces;
}
