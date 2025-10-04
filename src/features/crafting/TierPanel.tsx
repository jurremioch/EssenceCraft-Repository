import { useEffect, useMemo, useState } from "react";

import {
  type ActionSpec,
  type ActionPreview,
  type FamilyDefinition,
  type Risk,
  chanceForMode,
  chanceNormal,
  maxFeasibleAttempts,
  previewAction,
} from "@/engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import type { CraftingSettings } from "@/app/store/craftingStore";

const TIER_ORDER: Record<ActionSpec["tier"], number> = {
  T2: 0,
  T3: 1,
  T4: 2,
  T5: 3,
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatResource(resource: string, labels?: Record<string, string>) {
  return labels?.[resource] ?? resource;
}

function multiplyRecord(
  record: Record<string, number>,
  factor: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!value) continue;
    result[key] = value * factor;
  }
  return result;
}

function formatRequirements(
  record: Record<string, number>,
  labels?: Record<string, string>,
): string {
  const entries = Object.entries(record).filter(([, value]) => value > 0);
  if (!entries.length) return "None";
  return entries
    .map(([resource, value]) => `${value}× ${formatResource(resource, labels)}`)
    .join(", ");
}

function useActionPreview(
  action: ActionSpec,
  inventory: Record<string, number>,
  risk: Risk | undefined,
  extraCatalyst: number,
): ActionPreview {
  return useMemo(
    () => previewAction(action, inventory, risk, extraCatalyst),
    [action, inventory, risk, extraCatalyst],
  );
}

interface TierPanelProps {
  family: FamilyDefinition;
  action: ActionSpec;
  inventory: Record<string, number>;
  settings: CraftingSettings;
  onRun: (params: { action: ActionSpec; risk: Risk | undefined; attempts: number; extraCatalyst: number }) => void;
}

export function sortActions(actions: ActionSpec[]): ActionSpec[] {
  return [...actions].sort((a, b) => {
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tier !== 0) return tier;
    return a.name.localeCompare(b.name);
  });
}

export function TierPanel({ family, action, inventory, settings, onRun }: TierPanelProps) {
  const defaultRisk = useMemo(() => {
    if (action.risks) {
      const risks = Object.keys(action.risks) as Risk[];
      if (settings && family.defaults?.risks?.length) {
        const preferred = family.defaults.risks.find((entry) => risks.includes(entry));
        if (preferred) return preferred;
      }
      return risks[0];
    }
    return undefined;
  }, [action.risks, family.defaults?.risks, settings]);

  const [risk, setRisk] = useState<Risk | undefined>(defaultRisk);
  const [attempts, setAttempts] = useState(1);
  const [extraCatalyst, setExtraCatalyst] = useState(0);

  useEffect(() => {
    setRisk(defaultRisk);
  }, [defaultRisk]);

  const preview = useActionPreview(action, inventory, risk, extraCatalyst);

  const maxAttempts = useMemo(
    () => maxFeasibleAttempts(action, inventory, risk, extraCatalyst),
    [action, inventory, risk, extraCatalyst],
  );

  useEffect(() => {
    if (attempts > maxAttempts && Number.isFinite(maxAttempts)) {
      setAttempts(maxAttempts === 0 ? 1 : maxAttempts);
    }
  }, [attempts, maxAttempts]);

  const salvageChance = preview.io.salvage
    ? chanceNormal(preview.io.salvage.dc, settings.modifier)
    : undefined;
  const successChance = chanceForMode(preview.dc, settings.modifier, settings.rollMode);

  const totalRequirements = multiplyRecord(preview.consumption, attempts);

  const catalystResource = action.options?.dcReduction?.resource;
  const baseCatalystCost = catalystResource ? preview.io.consume[catalystResource] ?? 0 : 0;
  const availableCatalyst = catalystResource ? inventory[catalystResource] ?? 0 : 0;
  const maxCatalyst = catalystResource
    ? Math.max(0, availableCatalyst - baseCatalystCost)
    : 0;

  useEffect(() => {
    if (extraCatalyst > maxCatalyst) {
      setExtraCatalyst(maxCatalyst);
    }
  }, [extraCatalyst, maxCatalyst]);

  const disableRun = maxAttempts <= 0 || attempts <= 0;

  return (
    <Card className="h-full border-slate-200/60 bg-white/60 shadow-sm backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{action.name}</CardTitle>
        <CardDescription className="text-sm text-slate-500">
          {family.name} · {action.tier}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm text-slate-700">
        {action.risks ? (
          <div className="grid gap-2">
            <Label className="text-xs uppercase tracking-wide text-slate-500">Risk</Label>
            <Select value={risk ? (risk as string) : undefined} onValueChange={(value) => setRisk(value as Risk)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose risk" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(action.risks) as Risk[]).map((entry) => (
                  <SelectItem key={entry} value={entry} className="capitalize">
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {action.options?.dcReduction && action.options.allowExtraCatalyst ? (
          <div className="grid gap-2">
            <Label className="text-xs uppercase tracking-wide text-slate-500">
              Extra {formatResource(action.options.dcReduction.resource, family.resourceLabels)}
            </Label>
            <Input
              type="number"
              min={0}
              max={maxCatalyst}
              value={extraCatalyst}
              onChange={(event) => {
                const next = Number(event.target.value);
                setExtraCatalyst(Math.max(0, Number.isNaN(next) ? 0 : Math.min(next, maxCatalyst)));
              }}
            />
            <p className="text-xs text-slate-500">
              Reduces DC by {action.options.dcReduction.perUnit} each · min DC {action.options.dcReduction.minDC}
            </p>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Attempts</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={attempts}
              onChange={(event) => {
                const next = Number(event.target.value);
                setAttempts(Math.max(1, Number.isNaN(next) ? 1 : next));
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={maxAttempts <= 0 || !Number.isFinite(maxAttempts)}
              onClick={() => setAttempts(Math.max(1, maxAttempts))}
            >
              Max feasible ({Number.isFinite(maxAttempts) ? maxAttempts : "∞"})
            </Button>
          </div>
          {maxAttempts <= 0 ? (
            <p className="text-xs text-rose-500">Insufficient resources for this action.</p>
          ) : null}
        </div>

        <Separator className="bg-slate-200" />

        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">DC</span>
            <span className="font-semibold text-slate-900">{preview.dc}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Success chance</span>
            <span className="font-medium text-slate-900">{formatPercent(successChance)}</span>
          </div>
          {preview.io.salvage ? (
            <div className="flex items-center justify-between text-slate-600">
              <span>Salvage DC</span>
              <span>
                {preview.io.salvage.dc} · {formatPercent(salvageChance ?? 0)} chance
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-slate-600">
            <span>Time per attempt</span>
            <span>{preview.timeMinutes} minutes</span>
          </div>
          <div className="flex flex-col gap-1 text-slate-600">
            <span>Total requirements</span>
            <span className="font-medium text-slate-900">
              {formatRequirements(totalRequirements, family.resourceLabels)}
            </span>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={disableRun}
          onClick={() => onRun({ action, risk, attempts, extraCatalyst })}
        >
          Run simulation
        </Button>
      </CardContent>
    </Card>
  );
}
