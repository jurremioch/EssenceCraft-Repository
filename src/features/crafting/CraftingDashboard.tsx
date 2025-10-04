import { useCallback, useMemo } from "react";

import type { ActionSpec, Risk } from "@/engine";
import { simulateBatch } from "@/engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  type CraftingSettings,
  useCraftingStore,
  useResetStoreOnMissingPersistedState,
} from "@/app/store/craftingStore";
import { DiceOverlay } from "@/components/dice/DiceOverlay";
import { familyRegistry } from "@/families";

import { FamilyTabs } from "./FamilyTabs";
import { InventoryPanel } from "./InventoryPanel";
import { SettingsPanel } from "./SettingsPanel";

function createManualRandom(queue: number[]) {
  return () => {
    const value = queue.shift();
    if (value === undefined) {
      return Math.random();
    }
    return Math.min(0.999999, Math.max(0, (value - 1) / 20));
  };
}

export function CraftingDashboard() {
  useResetStoreOnMissingPersistedState();

  const activeFamilyId = useCraftingStore((state) => state.activeFamilyId);
  const inventory = useCraftingStore((state) => state.inventory);
  const settings = useCraftingStore((state) => state.settings);
  const sessionMinutes = useCraftingStore((state) => state.sessionMinutes);
  const log = useCraftingStore((state) => state.log);
  const rolls = useCraftingStore((state) => state.rolls);
  const overlayFaces = useCraftingStore((state) => state.overlayFaces);
  const statusMessage = useCraftingStore((state) => state.statusMessage);

  const setInventoryValue = useCraftingStore((state) => state.setInventoryValue);
  const snapshotInventory = useCraftingStore((state) => state.snapshotInventory);
  const restoreInventory = useCraftingStore((state) => state.restoreInventory);
  const clearInventory = useCraftingStore((state) => state.clearInventory);
  const updateSettings = useCraftingStore((state) => state.updateSettings);
  const updateManualQueue = useCraftingStore((state) => state.updateManualQueue);
  const commitBatchResult = useCraftingStore((state) => state.commitBatchResult);
  const clearStatusMessage = useCraftingStore((state) => state.clearStatusMessage);

  const family = useMemo(() => familyRegistry.get(activeFamilyId) ?? familyRegistry.values().next().value, [activeFamilyId]);

  const handleRun = useCallback(
    ({ action, risk, attempts, extraCatalyst }: {
      action: ActionSpec;
      risk: Risk | undefined;
      attempts: number;
      extraCatalyst: number;
    }) => {
      if (!family) return;
      const manualChecks = [...settings.manualCheckQueue];
      const manualSalvages = [...settings.manualSalvageQueue];

      const random = settings.rollResolution === "manual" ? createManualRandom(manualChecks) : undefined;
      const salvageRandom = settings.rollResolution === "manual" ? createManualRandom(manualSalvages) : undefined;

      const batch = simulateBatch(
        {
          action,
          inventory,
          modifier: settings.modifier,
          mode: settings.rollMode,
          risk,
          extraCatalyst,
          random,
          salvageRandom,
        },
        attempts,
      );

      commitBatchResult({
        familyId: family.id,
        actionId: action.id,
        actionName: action.name,
        risk,
        batch,
        manualCheckQueue: manualChecks,
        manualSalvageQueue: manualSalvages,
      });
    },
    [family, settings, inventory, commitBatchResult],
  );

  if (!family) {
    return <p className="p-6 text-sm text-slate-500">No families registered.</p>;
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-900">Essence Crafting</h1>
          <p className="text-sm text-slate-600">
            Powered by a modular rules engine. Currently exploring {family.name}.
          </p>
          {statusMessage ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <span>{statusMessage}</span>
              <Button variant="ghost" onClick={clearStatusMessage}>
                Dismiss
              </Button>
            </div>
          ) : null}
        </header>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <FamilyTabs family={family} inventory={inventory} settings={settings} onRunAction={handleRun} />
          </div>
          <div className="space-y-6">
            <InventoryPanel
              family={family}
              inventory={inventory}
              sessionMinutes={sessionMinutes}
              onChange={setInventoryValue}
              onSnapshot={() => snapshotInventory()}
              onRestore={() => restoreInventory()}
              onClear={clearInventory}
            />
            <SettingsPanel
              settings={settings as CraftingSettings}
              onChange={updateSettings}
              onUpdateManualQueue={updateManualQueue}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200/70 bg-white/70 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">Activity log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              {log.length === 0 ? (
                <p className="text-sm text-slate-500">Run a crafting action to populate the log.</p>
              ) : (
                <ul className="space-y-2">
                  {log.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-slate-200/70 bg-white/60 p-3">
                      <p className="font-medium text-slate-900">{entry.message}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(entry.timestamp).toLocaleTimeString()} · {entry.actionName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 bg-white/70 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">Recent rolls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-700">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checks</h3>
                <ul className="mt-2 space-y-1">
                  {rolls.checks.length === 0 ? (
                    <li className="text-xs text-slate-500">No rolls yet.</li>
                  ) : (
                    rolls.checks.map((roll) => (
                      <li key={roll.id} className="rounded-md border border-slate-200/70 bg-white/60 p-2">
                        <span className="font-medium text-slate-900">{roll.total}</span>
                        <span className="text-xs text-slate-500"> (d20 {roll.raw} + {roll.modifier}) vs DC {roll.dc}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Salvage</h3>
                <ul className="mt-2 space-y-1">
                  {rolls.salvages.length === 0 ? (
                    <li className="text-xs text-slate-500">No salvage rolls.</li>
                  ) : (
                    rolls.salvages.map((roll) => (
                      <li key={roll.id} className="rounded-md border border-slate-200/70 bg-white/60 p-2">
                        <span className="font-medium text-slate-900">{roll.total}</span>
                        <span className="text-xs text-slate-500"> (d20 {roll.raw} + {roll.modifier}) vs DC {roll.dc ?? "-"}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
      <DiceOverlay rolls={overlayFaces} />
    </div>
  );
}
