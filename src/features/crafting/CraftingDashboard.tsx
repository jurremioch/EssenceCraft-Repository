import { useCallback, useMemo } from "react";

import type { ActionSpec, Risk } from "@/engine";
import { simulateBatch } from "@/engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";

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
    <TooltipProvider>
      <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100">
        <div className="mx-auto flex min-h-screen max-w-[1240px] flex-col gap-8 px-6 py-10">
          <header className="flex flex-col gap-3">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900">Essence Crafting</h1>
              <p className="text-sm text-slate-600">
                Powered by a modular rules engine. Currently exploring {family.name}.
              </p>
            </div>
            {statusMessage ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-700 shadow-sm">
                <span>{statusMessage}</span>
                <Button variant="ghost" className="h-8 px-2 text-xs font-semibold" onClick={clearStatusMessage}>
                  Dismiss
                </Button>
              </div>
            ) : null}
          </header>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="space-y-5">
              <FamilyTabs family={family} inventory={inventory} settings={settings} onRunAction={handleRun} />
            </div>
            <div className="flex flex-col gap-5">
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
              <Card className="border-slate-200/70 bg-white/90 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-slate-900">Recent rolls</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-slate-700">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Checks</h3>
                      <ul className="space-y-2">
                        {rolls.checks.length === 0 ? (
                          <li className="text-xs text-slate-500">No rolls yet.</li>
                        ) : (
                          rolls.checks.map((roll) => (
                            <li
                              key={roll.id}
                              className="rounded-lg border border-slate-200/80 bg-white/80 p-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                            >
                              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                                <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                                <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                                  {roll.success ? "Success" : "Fail"}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900">
                                d20 {roll.raw} + {roll.modifier} = {roll.total} vs DC {roll.dc}
                              </p>
                              <p className="text-xs text-slate-500">{roll.actionName}</p>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Salvage</h3>
                      <ul className="space-y-2">
                        {rolls.salvages.length === 0 ? (
                          <li className="text-xs text-slate-500">No salvage rolls.</li>
                        ) : (
                          rolls.salvages.map((roll) => (
                            <li
                              key={roll.id}
                              className="rounded-lg border border-slate-200/80 bg-white/80 p-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                            >
                              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                                <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                                <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                                  {roll.success ? "Success" : "Fail"}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900">
                                d20 {roll.raw} + {roll.modifier} = {roll.total ?? roll.raw + roll.modifier} vs DC {roll.dc ?? "–"}
                              </p>
                              <p className="text-xs text-slate-500">{roll.actionName}</p>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section>
            <Card className="border-slate-200/70 bg-white/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Activity log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-700">
                {log.length === 0 ? (
                  <p className="text-sm text-slate-500">Run a crafting action to populate the log.</p>
                ) : (
                  <ul className="space-y-2">
                    {log.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-lg border border-slate-200/80 bg-white/80 p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                      >
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
          </section>
        </div>
        <DiceOverlay rolls={overlayFaces} />
      </div>
    </TooltipProvider>
  );
}
