import { useMemo } from "react";

import type { ActionSpec, FamilyDefinition, Risk } from "@/engine";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { CraftingSettings } from "@/app/store/craftingStore";

import { TierPanel, sortActions } from "./TierPanel";

const TIERS: ActionSpec["tier"][] = ["T2", "T3", "T4", "T5"];

interface FamilyTabsProps {
  family: FamilyDefinition;
  inventory: Record<string, number>;
  settings: CraftingSettings;
  onRunAction: (params: {
    action: ActionSpec;
    risk: Risk | undefined;
    attempts: number;
    extraCatalyst: number;
  }) => void;
}

export function FamilyTabs({ family, inventory, settings, onRunAction }: FamilyTabsProps) {
  const grouped = useMemo(() => {
    const byTier = new Map<ActionSpec["tier"], ActionSpec[]>();
    sortActions(family.actions).forEach((action) => {
      if (!byTier.has(action.tier)) {
        byTier.set(action.tier, []);
      }
      byTier.get(action.tier)!.push(action);
    });
    return byTier;
  }, [family.actions]);

  const initialTier = TIERS.find((tier) => grouped.has(tier)) ?? TIERS[0];

  if (!grouped.size) {
    return <p className="text-sm text-slate-500">No actions available for this family.</p>;
  }

  return (
    <Tabs defaultValue={initialTier} className="w-full">
      <TabsList className="mb-4 flex w-full flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm">
        {TIERS.filter((tier) => grouped.has(tier)).map((tier) => (
          <TabsTrigger
            key={tier}
            value={tier}
            className="flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500 transition data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            {tier}
          </TabsTrigger>
        ))}
      </TabsList>
      {TIERS.filter((tier) => grouped.has(tier)).map((tier) => (
        <TabsContent key={tier} value={tier} className="space-y-4 focus-visible:outline-none">
          <div className="grid gap-4 xl:grid-cols-2">
            {grouped.get(tier)!.map((action) => (
              <TierPanel
                key={action.id}
                family={family}
                action={action}
                inventory={inventory}
                settings={settings}
                onRun={onRunAction}
              />
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
