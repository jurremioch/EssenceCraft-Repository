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
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { CraftingSettings } from "@/app/store/craftingStore";

const TIER_ORDER: Record<ActionSpec["tier"], number> = {
  T2: 0,
  T3: 1,
  T4: 2,
  T5: 3,
};

const TIER_ACCENTS: Record<ActionSpec["tier"], { gradient: string; badge: string; shadow: string }> = {
  T2: {
    gradient: "from-emerald-300 via-emerald-400 to-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-400/60",
    shadow: "shadow-[0_0_0_1px_rgba(16,185,129,0.12)]",
  },
  T3: {
    gradient: "from-sky-300 via-sky-400 to-sky-500",
    badge: "bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-400/60",
    shadow: "shadow-[0_0_0_1px_rgba(56,189,248,0.12)]",
  },
  T4: {
    gradient: "from-violet-300 via-violet-400 to-violet-500",
    badge: "bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-400/60",
    shadow: "shadow-[0_0_0_1px_rgba(139,92,246,0.12)]",
  },
  T5: {
    gradient: "from-amber-300 via-amber-400 to-amber-500",
    badge: "bg-amber-500/10 text-amber-800 ring-1 ring-inset ring-amber-400/60",
    shadow: "shadow-[0_0_0_1px_rgba(251,191,36,0.16)]",
  },
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

  const exceededMax = Number.isFinite(maxAttempts) && attempts > maxAttempts;
  const disableRun = maxAttempts <= 0 || attempts <= 0 || exceededMax;
  let disableReason: string | null = null;
  if (maxAttempts <= 0) {
    disableReason = "Insufficient resources";
  } else if (attempts <= 0) {
    disableReason = "Enter at least one attempt";
  } else if (exceededMax) {
    disableReason = `Only ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"} possible`;
  }

  const accent = TIER_ACCENTS[action.tier];
  const feasibleBadge = maxAttempts > 0;

  return (
    <Card
      className={`relative h-full overflow-hidden border border-slate-200/70 bg-white/90 ${accent.shadow}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.gradient}`} />
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-slate-900">{action.name}</CardTitle>
            <CardDescription className="text-xs uppercase tracking-wide text-slate-500">
              {family.name}
            </CardDescription>
          </div>
          <Badge className={`whitespace-nowrap text-[0.7rem] font-semibold uppercase ${accent.badge}`}>
            {action.tier}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-700">
        {action.risks ? (
          <div className="grid gap-1.5">
            <Label className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Risk</Label>
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
          <div className="grid gap-1.5">
            <Label className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">
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

        <div className="grid gap-1.5">
          <Label className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Attempts</Label>
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
              className="h-8 whitespace-nowrap px-3 text-xs"
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

        <div className="grid gap-3 rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>Feasibility</span>
              </TooltipTrigger>
              <TooltipContent>Calculated from your current inventory for this action.</TooltipContent>
            </Tooltip>
            <Badge
              className={`px-2 py-0.5 text-[0.65rem] font-semibold ${
                feasibleBadge
                  ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-400/40"
                  : "bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-400/50"
              }`}
            >
              {feasibleBadge ? "Ready" : "Blocked"}
            </Badge>
          </div>
          <p className="text-xs text-slate-600">
            Up to {Number.isFinite(maxAttempts) ? maxAttempts : "∞"} attempt{maxAttempts === 1 ? "" : "s"} possible with
            current resources.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex flex-col">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Check DC</span>
                </TooltipTrigger>
                <TooltipContent>
                  Includes any catalyst reductions and selected risk for the main roll.
                </TooltipContent>
              </Tooltip>
              <span className="text-base font-semibold text-slate-900">{preview.dc}</span>
            </div>
            <div className="flex flex-col text-right">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Success %</span>
                </TooltipTrigger>
                <TooltipContent>Based on your crafting modifier and roll mode.</TooltipContent>
              </Tooltip>
              <span className="text-base font-semibold text-slate-900">{formatPercent(successChance)}</span>
            </div>
            {preview.io.salvage ? (
              <div className="flex flex-col">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Salvage DC</span>
                  </TooltipTrigger>
                  <TooltipContent>Salvage always uses a single d20 without advantage or disadvantage.</TooltipContent>
                </Tooltip>
                <span className="text-sm font-medium text-slate-900">
                  {preview.io.salvage.dc} · {formatPercent(salvageChance ?? 0)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col text-slate-500">
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">Salvage</span>
                <span className="text-sm">N/A</span>
              </div>
            )}
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Time</span>
              <span className="text-sm font-medium text-slate-900">{preview.timeMinutes} min</span>
            </div>
          </dl>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Requirements</span>
            <span className="text-sm font-medium text-slate-900">
              {formatRequirements(totalRequirements, family.resourceLabels)}
            </span>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                className="mt-2 w-full"
                disabled={disableRun}
                aria-disabled={disableRun}
                onClick={() => onRun({ action, risk, attempts, extraCatalyst })}
              >
                Run crafting batch
              </Button>
            </span>
          </TooltipTrigger>
          {disableRun && disableReason ? (
            <TooltipContent>{disableReason}</TooltipContent>
          ) : null}
        </Tooltip>
      </CardContent>
    </Card>
  );
}
