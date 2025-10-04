import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Calculator,
  FlaskConical,
  Info,
  Minus,
  PackageMinus,
  PackagePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { DiceOverlay } from "@/components/DiceOverlay";
import type { DiceFace } from "@/components/DiceOverlay";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdvantageMode } from "@/lib/math";
import {
  applyInventoryDelta,
  computeAttemptCost,
  computeDc,
  computeMaxAttempts,
  computeSuccessProfile,
  createEmptyInventory,
  getActiveFamily,
  getMinimumDc,
  getResourceDefinitions,
  getRiskProfiles,
  getRiskRule,
  getSupportedRisks,
  getTierOrder,
  getTierRule,
  runSmokeTests,
} from "@/lib/rules";
import type { Inventory, RiskLevel, TierKey } from "@/lib/rules";
import { loadState, saveState } from "@/lib/storage";
import { clampInt, cn, d20, formatMinutes, parseCSVInts } from "@/lib/util";

const MAX_ROLL_HISTORY = 12;
const MAX_LOG_ENTRIES = 120;

type RollMode = "auto" | "manual";

interface Settings {
  rollMode: RollMode;
  advantage: AdvantageMode;
  modifier: number;
  manualCheckQueue: number[];
  manualSalvageQueue: number[];
}

interface RollRecord {
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

interface RollsState {
  checks: RollRecord[];
  salvages: RollRecord[];
}

interface ActionLogEntry {
  id: string;
  timestamp: string;
  tier: TierKey | "system";
  risk?: RiskLevel;
  text: string;
}

interface AppState {
  inventory: Inventory;
  settings: Settings;
  log: ActionLogEntry[];
  sessionMinutes: number;
  rolls: RollsState;
}

const createDefaultState = (): AppState => ({
  inventory: createEmptyInventory(),
  settings: {
    rollMode: "auto",
    advantage: "normal",
    modifier: 0,
    manualCheckQueue: [],
    manualSalvageQueue: [],
  },
  log: [],
  sessionMinutes: 0,
  rolls: { checks: [], salvages: [] },
});

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

const Chip = ({
  ok = true,
  title,
  children,
  className,
}: {
  ok?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) => (
  <span
    title={title}
    className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm",
      ok
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700",
      className,
    )}
  >
    {children}
  </span>
);

interface NaturalEssenceCraftingAppProps {
  compactMode: boolean;
  onToggleCompactMode: (value: boolean) => void;
}

function hasResources(inventory: Inventory, costs: Partial<Inventory>): boolean {
  return Object.entries(costs).every(([key, amount]) => {
    if (!amount) return true;
    const typed = key as keyof Inventory;
    return (inventory[typed] ?? 0) >= amount;
  });
}

function diffInventory(
  before: Inventory,
  after: Inventory,
  resourceKeys: string[],
): Partial<Inventory> {
  const delta: Partial<Inventory> = {};
  for (const key of resourceKeys) {
    const beforeValue = before[key as keyof Inventory] ?? 0;
    const afterValue = after[key as keyof Inventory] ?? 0;
    const change = afterValue - beforeValue;
    if (change !== 0) {
      delta[key as keyof Inventory] = change;
    }
  }
  return delta;
}

function formatDelta(
  delta: Partial<Inventory>,
  resourceKeys: string[],
  labels: Record<string, string>,
): string {
  const orderedKeys = Array.from(new Set([...resourceKeys, ...Object.keys(delta)]));
  const parts: string[] = [];
  for (const key of orderedKeys) {
    const amount = delta[key as keyof Inventory];
    if (!amount) continue;
    const sign = amount > 0 ? "+" : "";
    const label = labels[key] ?? key;
    parts.push(`${sign}${amount} ${label}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no change";
}

function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

function scaleDelta(delta: Partial<Inventory>, factor: number): Partial<Inventory> {
  const scaled: Partial<Inventory> = {};
  for (const [key, value] of Object.entries(delta)) {
    if (!value) continue;
    scaled[key as keyof Inventory] = (value as number) * factor;
  }
  return scaled;
}

function mergeDeltas(...deltas: Partial<Inventory>[]): Partial<Inventory> {
  const result: Partial<Inventory> = {};
  for (const delta of deltas) {
    for (const [key, value] of Object.entries(delta)) {
      if (!value) continue;
      const typedKey = key as keyof Inventory;
      result[typedKey] = (result[typedKey] ?? 0) + (value as number);
    }
  }
  return result;
}

export function NaturalEssenceCraftingApp({
  compactMode,
  onToggleCompactMode,
}: NaturalEssenceCraftingAppProps) {
  const family = getActiveFamily();
  const resourceDefinitions = getResourceDefinitions();
  const resourceKeys = resourceDefinitions.map((resource) => resource.key);
  const resourceLabels = Object.fromEntries(
    resourceDefinitions.map((resource) => [resource.key, resource.label]),
  ) as Record<string, string>;
  const tierOrder = getTierOrder();
  const riskProfiles = getRiskProfiles();
  const riskLabels = Object.fromEntries(riskProfiles.map((risk) => [risk.key, risk.label])) as Record<
    string,
    string
  >;
  const minimumDc = getMinimumDc();

  const supportedRisksByTier = new Map<TierKey, RiskLevel[]>(
    tierOrder.map((tier) => [tier, getSupportedRisks(tier)]),
  );
  const firstTier = tierOrder[0] ?? (family.tiers[0]?.key as TierKey);
  const fallbackRisk = (riskProfiles[0]?.key ?? "standard") as RiskLevel;

  const [state, setState] = useState<AppState>(() => {
    const defaults = createDefaultState();
    const stored = loadState(defaults);
    return {
      ...defaults,
      ...stored,
      inventory: { ...defaults.inventory, ...(stored.inventory ?? {}) },
      settings: { ...defaults.settings, ...(stored.settings ?? {}) },
      rolls: {
        checks: stored.rolls?.checks ?? [],
        salvages: stored.rolls?.salvages ?? [],
      },
      log: stored.log ?? [],
      sessionMinutes: stored.sessionMinutes ?? 0,
    };
  });
  const [prevInventory, setPrevInventory] = useState<Inventory | null>(null);
  const [activeTier, setActiveTier] = useState<TierKey>(firstTier ?? ("" as TierKey));
  const [attemptCounts, setAttemptCounts] = useState<Record<TierKey, number>>(() => {
    const counts: Record<string, number> = {};
    for (const tier of tierOrder) {
      counts[tier] = 1;
    }
    return counts as Record<TierKey, number>;
  });
  const [riskSelections, setRiskSelections] = useState<Record<TierKey, RiskLevel>>(() => {
    const selections: Record<string, RiskLevel> = {};
    for (const tier of tierOrder) {
      const available = supportedRisksByTier.get(tier) ?? [];
      const defaultRisk = available[0] ?? (getTierRule(tier).risks[0]?.risk as RiskLevel) ?? fallbackRisk;
      selections[tier] = defaultRisk;
    }
    return selections as Record<TierKey, RiskLevel>;
  });
  const [extraResources, setExtraResources] = useState<Record<TierKey, number>>(() => {
    const extras: Record<string, number> = {};
    for (const tier of tierOrder) {
      extras[tier] = 0;
    }
    return extras as Record<TierKey, number>;
  });
  const [diceOverlay, setDiceOverlay] = useState<DiceFace[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [manualCheckText, setManualCheckText] = useState<string>("");
  const [manualSalvageText, setManualSalvageText] = useState<string>("");

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    setManualCheckText(state.settings.manualCheckQueue.join(", "));
  }, [state.settings.manualCheckQueue]);

  useEffect(() => {
    setManualSalvageText(state.settings.manualSalvageQueue.join(", "));
  }, [state.settings.manualSalvageQueue]);

  const modifier = state.settings.modifier;
  const effectiveAdvantage: AdvantageMode =
    state.settings.rollMode === "auto" ? state.settings.advantage : "normal";

  const handleInventoryChange = (key: keyof Inventory, value: number) => {
    setState((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [key]: Math.max(0, Math.round(value)),
      },
    }));
  };

  const handleManualQueueCommit = (type: "check" | "salvage") => {
    const text = type === "check" ? manualCheckText : manualSalvageText;
    const parsed = parseCSVInts(text);
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        manualCheckQueue: type === "check" ? parsed : prev.settings.manualCheckQueue,
        manualSalvageQueue: type === "salvage" ? parsed : prev.settings.manualSalvageQueue,
      },
    }));
  };

  const handleUndo = () => {
    if (!prevInventory) {
      setStatusMessage("Nothing to undo yet.");
      return;
    }

    setState((prev) => ({
      ...prev,
      inventory: cloneInventory(prevInventory),
    }));
    setPrevInventory(null);
    setStatusMessage("Inventory restored to previous snapshot.");
  };

  const handleClear = () => {
    setPrevInventory(cloneInventory(state.inventory));
    setState((prev) => ({
      ...prev,
      inventory: createEmptyInventory(),
    }));
    setStatusMessage("Inventory cleared.");
  };

  const handleSmokeTests = () => {
    const results = runSmokeTests();
    const timestamp = new Date().toISOString();
    const entries: ActionLogEntry[] = results.map((text, index) => ({
      id: `${timestamp}-smoke-${index}`,
      timestamp,
      tier: "system",
      text,
    }));

    setState((prev) => ({
      ...prev,
      log: [...entries, ...prev.log].slice(0, MAX_LOG_ENTRIES),
    }));
    setStatusMessage("Smoke tests appended to the log.");
  };



  const runCrafting = (tier: TierKey) => {
    const attemptsRequested = Math.max(1, attemptCounts[tier] ?? 1);
    const risk = riskSelections[tier];
    const tierRule = getTierRule(tier);
    const extraResourceAmount = tierRule.dcReduction
      ? Math.max(0, extraResources[tier] ?? 0)
      : 0;
    const attemptCosts = computeAttemptCost(tier, risk, extraResourceAmount);
    const feasible = computeMaxAttempts(state.inventory, tier, risk, extraResourceAmount);

    if (feasible <= 0) {
      setStatusMessage("Insufficient resources for that action.");
      setDiceOverlay(null);
      return;
    }

    const riskRule = getRiskRule(tier, risk);
    const { dc } = computeDc(tier, risk, extraResourceAmount);
    const manualChecks = [...state.settings.manualCheckQueue];
    const manualSalvages = [...state.settings.manualSalvageQueue];
    let workingInventory = cloneInventory(state.inventory);
    const baseInventory = cloneInventory(state.inventory);
    const newChecks: RollRecord[] = [];
    const newSalvages: RollRecord[] = [];
    const newLog: ActionLogEntry[] = [];
    const overlayFaces: DiceFace[] = [];
    const now = new Date();
    let attemptsCompleted = 0;
    let totalMinutes = 0;

    for (let i = 0; i < attemptsRequested; i += 1) {
      if (!hasResources(workingInventory, attemptCosts)) {
        break;
      }

      const before = cloneInventory(workingInventory);
      workingInventory = applyInventoryDelta(workingInventory, scaleDelta(attemptCosts, -1));

      let rawRoll = 0;
      if (state.settings.rollMode === "manual") {
        rawRoll = manualChecks.shift() ?? d20();
      } else {
        const first = d20();
        if (effectiveAdvantage === "normal") {
          rawRoll = first;
        } else {
          const second = d20();
          rawRoll = effectiveAdvantage === "advantage" ? Math.max(first, second) : Math.min(first, second);
        }
      }
      const total = rawRoll + modifier;
      const success = total >= dc;

      if (success) {
        workingInventory = applyInventoryDelta(workingInventory, tierRule.success);
      }

      const checkRecord: RollRecord = {
        id: `${now.getTime()}-${tier}-${i}-check`,
        timestamp: now.toISOString(),
        tier,
        risk,
        dc,
        raw: rawRoll,
        modifier,
        total,
        success,
      };
      newChecks.unshift(checkRecord);

      let salvageInfo = "";
      if (!success && riskRule.salvage) {
        const salvageRoll = state.settings.rollMode === "manual"
          ? manualSalvages.shift() ?? d20()
          : d20();
        const salvageTotal = salvageRoll + modifier;
        const salvageSuccess = salvageTotal >= riskRule.salvage.dc;
        if (salvageSuccess) {
          workingInventory = applyInventoryDelta(workingInventory, riskRule.salvage.returns);
        }
        salvageInfo = `Salvage ${salvageSuccess ? "✓" : "✗"} (${salvageTotal} vs DC ${riskRule.salvage.dc})`;
        const salvageRecord: RollRecord = {
          id: `${now.getTime()}-${tier}-${i}-salvage`,
          timestamp: now.toISOString(),
          tier,
          risk,
          dc: riskRule.salvage.dc,
          raw: salvageRoll,
          modifier,
          total: salvageTotal,
          success: salvageSuccess,
        };
        newSalvages.unshift(salvageRecord);

        if (attemptsRequested === 1) {
          overlayFaces.push({
            id: salvageRecord.id,
            label: "Salvage",
            raw: salvageRoll,
            total: salvageTotal,
            dc: riskRule.salvage.dc,
            success: salvageSuccess,
          });
        }
      }

      const after = cloneInventory(workingInventory);
      const delta = diffInventory(before, after, resourceKeys);
      const entry: ActionLogEntry = {
        id: `${now.getTime()}-${tier}-${i}`,
        timestamp: now.toISOString(),
        tier,
        risk,
        text: `${tier} ${risk} ${success ? "success" : "failure"} (${total} vs DC ${dc}) — ${formatDelta(delta, resourceKeys, resourceLabels)}${salvageInfo
          ? `. ${salvageInfo}`
          : ""}`,
      };
      newLog.unshift(entry);

      if (attemptsRequested === 1) {
        overlayFaces.unshift({
          id: checkRecord.id,
          label: "Main Check",
          raw: rawRoll,
          total,
          dc,
          success,
        });
      }

      attemptsCompleted += 1;
      totalMinutes += riskRule.timeMinutes;
    }

    if (attemptsCompleted === 0) {
      setStatusMessage("Ran out of resources before any attempts could begin.");
      setDiceOverlay(null);
      return;
    }

    setPrevInventory(baseInventory);
    setState((prev) => {
      const updatedChecks = [...newChecks, ...prev.rolls.checks].slice(0, MAX_ROLL_HISTORY);
      const updatedSalvages = [...newSalvages, ...prev.rolls.salvages].slice(0, MAX_ROLL_HISTORY);
      const updatedLog = [...newLog, ...prev.log].slice(0, MAX_LOG_ENTRIES);

      return {
        ...prev,
        inventory: workingInventory,
        settings: {
          ...prev.settings,
          manualCheckQueue: manualChecks,
          manualSalvageQueue: manualSalvages,
        },
        rolls: {
          checks: updatedChecks,
          salvages: updatedSalvages,
        },
        log: updatedLog,
        sessionMinutes: prev.sessionMinutes + totalMinutes,
      };
    });

    if (attemptsRequested === 1) {
      setDiceOverlay(overlayFaces);
    } else {
      setDiceOverlay(null);
    }

    if (attemptsCompleted < attemptsRequested) {
      setStatusMessage(`Attempted ${attemptsCompleted} / ${attemptsRequested}; resources exhausted mid-batch.`);
    } else {
      setStatusMessage(`Completed ${attemptsCompleted} ${tier} ${risk} attempt${attemptsCompleted === 1 ? "" : "s"}.`);
    }
  };

  const renderEvChips = (
    tier: TierKey,
    risk: RiskLevel,
    extraResource: number,
    successChance: number,
    salvageChance: number | undefined,
  ) => {
    const costs = computeAttemptCost(tier, risk, extraResource);
    const successGain = getTierRule(tier).success;
    const salvageGain = getRiskRule(tier, risk).salvage?.returns ?? {};

    const costDelta = scaleDelta(costs, -1);
    const successDelta = mergeDeltas(costDelta, successGain);
    const salvageDelta = mergeDeltas(costDelta, salvageGain);

    const failChance = 1 - successChance;
    const salvageOverall = failChance * (salvageChance ?? 0);
    const plainFail = Math.max(0, failChance - salvageOverall);

    const expected = mergeDeltas(
      scaleDelta(successDelta, successChance),
      scaleDelta(salvageDelta, salvageOverall),
      scaleDelta(costDelta, plainFail),
    );

    const chips = resourceKeys
      .filter((key) => (expected[key as keyof Inventory] ?? 0) !== 0)
      .map((key) => {
        const value = expected[key as keyof Inventory] ?? 0;
        const sign = value > 0 ? "+" : "";
        return (
          <Chip key={key} ok={value >= 0}>
            {sign}
            {value.toFixed(2)} {resourceLabels[key] ?? key}
          </Chip>
        );
      });

    return chips.length > 0 ? chips : <span className="text-xs text-slate-500">No net change</span>;
  };

  const renderTierPanel = (tier: TierKey) => {
    const rule = getTierRule(tier);
    const risk = riskSelections[tier];
    const attempts = Math.max(1, attemptCounts[tier]);
    const extraResource = rule.dcReduction ? Math.max(0, extraResources[tier] ?? 0) : 0;
    const { dc, wastedExtra, reductionResource } = computeDc(tier, risk, extraResource);
    const profile = computeSuccessProfile(
      tier,
      risk,
      extraResource,
      modifier,
      effectiveAdvantage,
    );
    const salvageChance = profile.salvageChance;
    const feasible = computeMaxAttempts(state.inventory, tier, risk, extraResource);
    const riskRule = getRiskRule(tier, risk);
    const attemptCosts = computeAttemptCost(tier, risk, extraResource);
    const totalTime = attempts * riskRule.timeMinutes;
    const reductionLabel = reductionResource
      ? resourceLabels[reductionResource] ?? reductionResource
      : null;
    const extraResourceLabel = rule.dcReduction
      ? resourceLabels[rule.dcReduction.resource] ?? rule.dcReduction.resource
      : "";

    const missingResources = resourceKeys
      .flatMap((resource) => {
        const perAttempt = attemptCosts[resource as keyof Inventory] ?? 0;
        if (!perAttempt) return [];
        const need = perAttempt * attempts;
        const have = state.inventory[resource as keyof Inventory] ?? 0;
        const shortfall = need - have;
        const label = resourceLabels[resource] ?? resource;
        return shortfall > 0 ? [`${shortfall} more ${label}`] : [];
      })
      .join(", ");

    let disabledReason: string | null = null;
    if (attempts < 1) {
      disabledReason = "Enter at least one attempt.";
    } else if (feasible <= 0) {
      disabledReason = missingResources || "Not enough resources for an attempt.";
    } else if (Number.isFinite(feasible) && attempts > feasible) {
      disabledReason = missingResources || "Reduce attempts or add resources.";
    }

    const requirementChips = resourceKeys.flatMap((resource) => {
      const perAttempt = attemptCosts[resource as keyof Inventory];
      if (!perAttempt) return [];
      const need = perAttempt * attempts;
      const have = state.inventory[resource as keyof Inventory] ?? 0;
      const enough = have >= need;
      const label = resourceLabels[resource] ?? resource;
      return [
        <Chip
          key={resource}
          ok={enough}
          title={`Need ${need} ${label} (have ${have}) for this batch`}
        >
          Need {need} {label}
        </Chip>,
      ];
    });

    const consumesPerAttempt = resourceKeys.flatMap((resource) => {
      const value = attemptCosts[resource as keyof Inventory];
      if (!value) return [];
      const label = resourceLabels[resource] ?? resource;
      return [
        <Chip
          key={`consume-${resource}`}
          ok={false}
          className="flex items-center gap-1"
          title={`Consumes ${value} ${label} per attempt`}
        >
          <PackageMinus className="h-3 w-3" aria-hidden="true" />-{value} {label}
        </Chip>,
      ];
    });

    const producesOnSuccess = resourceKeys.flatMap((resource) => {
      const value = rule.success[resource as keyof Inventory];
      if (!value) return [];
      const label = resourceLabels[resource] ?? resource;
      return [
        <Chip
          key={`produce-${resource}`}
          ok
          className="flex items-center gap-1"
          title={`On success gain ${value} ${label}`}
        >
          <PackagePlus className="h-3 w-3" aria-hidden="true" />+{value} {label}
        </Chip>,
      ];
    });

    const consumptionSummary = resourceKeys
      .flatMap((resource) => {
        const value = attemptCosts[resource as keyof Inventory];
        if (!value) return [];
        const label = resourceLabels[resource] ?? resource;
        return [`${value} ${label}`];
      })
      .join(", ");

    const successPct = Math.round(profile.successChance * 100);
    const salvagePct =
      salvageChance !== undefined ? Math.round(salvageChance * 100) : undefined;
    const feasibleLabel = Number.isFinite(feasible) ? feasible : "∞";
    const feasibilityOk = feasible > 0;

    const runButtonLabel = disabledReason ? "Unavailable" : `Run batch (${attempts})`;

    return (
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold text-slate-900">
            <span
              className={`bg-gradient-to-r ${rule.gradient} bg-clip-text text-transparent`}
            >
              {rule.subtitle}
            </span>
          </CardTitle>
          <CardDescription className="text-[11px] text-slate-500">
            {riskRule.timeMinutes} minutes per attempt · DC {dc}
            {reductionLabel && wastedExtra > 0 ? (
              <span className="ml-1 text-amber-600">
                {wastedExtra} {reductionLabel} wasted beyond DC {rule.dcReduction?.minDc ?? minimumDc}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 md:items-start">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${tier}-risk`}>Risk profile</Label>
                <Select
                  value={risk}
                  onValueChange={(value) =>
                    setRiskSelections((prev) => ({ ...prev, [tier]: value as RiskLevel }))
                  }
                >
                  <SelectTrigger id={`${tier}-risk`} className="h-9">
                    <SelectValue placeholder="Select risk" />
                  </SelectTrigger>
                  <SelectContent>
                    {getSupportedRisks(tier).map((option) => (
                      <SelectItem key={option} value={option}>
                        {riskLabels[option] ?? option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${tier}-attempts`}>Batch size</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Decrease attempts"
                    className={cn(focusRing, "h-9 w-9 p-0")}
                    onClick={() =>
                      setAttemptCounts((prev) => ({
                        ...prev,
                        [tier]: clampInt(prev[tier] - 1, 1, 999),
                      }))
                    }
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Input
                    id={`${tier}-attempts`}
                    type="number"
                    min={1}
                    value={attempts}
                    onChange={(event) =>
                      setAttemptCounts((prev) => ({
                        ...prev,
                        [tier]: clampInt(Number(event.target.value), 1, 999),
                      }))
                    }
                    className="h-9 w-24 text-center focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Increase attempts"
                    className={cn(focusRing, "h-9 w-9 p-0")}
                    onClick={() =>
                      setAttemptCounts((prev) => ({
                        ...prev,
                        [tier]: clampInt(prev[tier] + 1, 1, 999),
                      }))
                    }
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      focusRing,
                      "h-9 px-3 text-xs text-indigo-600 hover:text-indigo-700",
                    )}
                    onClick={() =>
                      setAttemptCounts((prev) => ({
                        ...prev,
                        [tier]: feasible === Infinity ? prev[tier] : Math.max(1, feasible),
                      }))
                    }
                  >
                    Max feasible
                  </Button>
                </div>
              </div>

              {rule.dcReduction ? (
                <div className="space-y-1">
                  <Label htmlFor={`${tier}-extra`}>
                    Extra {extraResourceLabel} per attempt
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Decrease extra ${extraResourceLabel}`}
                      className={cn(focusRing, "h-9 w-9 p-0")}
                      onClick={() =>
                        setExtraResources((prev) => ({
                          ...prev,
                          [tier]: Math.max(0, (prev[tier] ?? 0) - 1),
                        }))
                      }
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Input
                      id={`${tier}-extra`}
                      type="number"
                      min={0}
                      value={extraResource}
                      onChange={(event) =>
                        setExtraResources((prev) => ({
                          ...prev,
                          [tier]: Math.max(0, Math.round(Number(event.target.value))),
                        }))
                      }
                      className="h-9 w-24 text-center focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={`Increase extra ${extraResourceLabel}`}
                      className={cn(focusRing, "h-9 w-9 p-0")}
                      onClick={() =>
                        setExtraResources((prev) => ({
                          ...prev,
                          [tier]: Math.max(0, (prev[tier] ?? 0) + 1),
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <p className="text-[11px] text-slate-500">
                      Lowers DC by {rule.dcReduction.perUnit} each (minimum {rule.dcReduction.minDc}).
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                <p className="text-[11px] font-medium text-slate-500">
                  Requirements for {attempts} attempt{attempts === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {requirementChips.length > 0 ? (
                    requirementChips
                  ) : (
                    <span className="text-xs text-slate-500">No resources required.</span>
                  )}
                </div>
              </div>

              <Tooltip disableHoverableContent={!disabledReason}>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      onClick={() => runCrafting(tier)}
                      disabled={Boolean(disabledReason)}
                      title={disabledReason ?? undefined}
                      className={cn(
                        focusRing,
                        "w-full justify-center bg-indigo-600 text-white hover:bg-indigo-700",
                        disabledReason ? "cursor-not-allowed opacity-60" : "",
                      )}
                    >
                      {runButtonLabel}
                    </Button>
                  </span>
                </TooltipTrigger>
                {disabledReason ? <TooltipContent>{disabledReason}</TooltipContent> : null}
              </Tooltip>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700">Snapshot</p>
                <div className="flex flex-wrap gap-2">
                  <Chip title="Chance main check succeeds">Success {successPct}%</Chip>
                  {salvagePct !== undefined ? (
                    <Chip title="Chance salvage succeeds">Salvage {salvagePct}%</Chip>
                  ) : null}
                  <Chip className="border-indigo-200 bg-indigo-50 text-indigo-700" title="Difficulty class">
                    DC {dc}
                  </Chip>
                  <Chip ok={feasibilityOk} title="Attempts you can afford right now">
                    Feasible {feasibleLabel}
                  </Chip>
                  <Chip
                    className="border-slate-200 bg-white text-slate-700"
                    title="Time required for this batch"
                  >
                    Time {formatMinutes(totalTime)}
                  </Chip>
                  <Chip
                    className="border-slate-200 bg-white text-slate-700"
                    title="Resources consumed each attempt"
                  >
                    Consumes {consumptionSummary || "nothing"}
                  </Chip>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">Consumes per attempt</p>
                <div className="flex flex-wrap gap-2">
                  {consumesPerAttempt.length > 0 ? (
                    consumesPerAttempt
                  ) : (
                    <span className="text-xs text-slate-500">No costs.</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-700">On success</p>
                <div className="flex flex-wrap gap-2">
                  {producesOnSuccess.length > 0 ? (
                    producesOnSuccess
                  ) : (
                    <span className="text-xs text-slate-500">No resource change.</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Calculator className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  Expected value per attempt
                  <Tooltip>
                    <TooltipTrigger aria-label="Expected value explanation">
                      <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Success, failure, and salvage chances combined into an average resource change per attempt.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-wrap gap-2">
                  {renderEvChips(tier, risk, extraResource, profile.successChance, salvageChance)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };


  return (
    <TooltipProvider>
      <div data-compact={compactMode} className="flex flex-col gap-6 pb-16">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-7 w-7 text-indigo-600" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-slate-900">{family.label}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip className="border-slate-200 bg-white text-slate-700" title="Session duration">
                Session {formatMinutes(state.sessionMinutes)}
              </Chip>
              <Chip className="border-slate-200 bg-white text-slate-700" title="Log entries recorded">
                Log {state.log.length}
              </Chip>
              <Chip className="border-slate-200 bg-white text-slate-700" title="Total recent rolls tracked">
                Rolls {state.rolls.checks.length + state.rolls.salvages.length}
              </Chip>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {family.description ?? "Track inventory, roll checks, and keep your refinement pipeline humming."}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg font-semibold text-slate-900">Inventory</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Update your current stock. Crafting actions adjust automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resourceKeys.map((resource) => (
                  <div key={resource} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`inv-${resource}`} className="text-sm font-medium text-slate-600">
                      {resourceLabels[resource] ?? resource}
                    </Label>
                    <Input
                      id={`inv-${resource}`}
                      type="number"
                      min={0}
                      value={state.inventory[resource as keyof Inventory] ?? 0}
                      onChange={(event) =>
                        handleInventoryChange(
                          resource as keyof Inventory,
                          Math.max(0, Number(event.target.value)),
                        )
                      }
                      className="h-9 w-24 text-right focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(focusRing, "h-9 px-3")}
                  onClick={handleUndo}
                >
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Undo
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className={cn(focusRing, "h-9 px-3")}
                  onClick={handleClear}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg font-semibold text-slate-900">Settings & rolls</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Configure modifiers, rolling behaviour, and queue manual results.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="modifier">Crafting modifier</Label>
                  <Input
                    id="modifier"
                    type="number"
                    value={modifier}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          modifier: Number(event.target.value) || 0,
                        },
                      }))
                    }
                    className="h-9 w-24 focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="advantage">Main check mode</Label>
                  <Select
                    value={state.settings.advantage}
                    onValueChange={(value) =>
                      setState((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          advantage: value as AdvantageMode,
                        },
                      }))
                    }
                    disabled={state.settings.rollMode === "manual"}
                  >
                    <SelectTrigger id="advantage" className="h-9">
                      <SelectValue placeholder="Select advantage mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="advantage">Advantage</SelectItem>
                      <SelectItem value="disadvantage">Disadvantage</SelectItem>
                    </SelectContent>
                  </Select>
                  {state.settings.rollMode === "manual" ? (
                    <p className="text-[11px] text-slate-500">Manual mode always rolls a single d20.</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Auto rolling</p>
                      <p className="text-[11px] text-slate-500">Toggle manual queues for precise control.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <span>Manual</span>
                      <Switch
                        aria-label="Toggle auto rolling"
                        checked={state.settings.rollMode === "auto"}
                        onCheckedChange={(checked) =>
                          setState((prev) => ({
                            ...prev,
                            settings: {
                              ...prev.settings,
                              rollMode: checked ? "auto" : "manual",
                            },
                          }))
                        }
                      />
                      <span>Auto</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Compact mode</p>
                      <p className="text-[11px] text-slate-500">Reduce padding and gaps across the interface.</p>
                    </div>
                    <Switch
                      aria-label="Toggle compact layout"
                      checked={compactMode}
                      onCheckedChange={(checked) => onToggleCompactMode(checked)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-checks">Manual check rolls (comma separated)</Label>
                  <Input
                    id="manual-checks"
                    value={manualCheckText}
                    onChange={(event) => setManualCheckText(event.target.value)}
                    onBlur={() => handleManualQueueCommit("check")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleManualQueueCommit("check");
                      }
                    }}
                    placeholder="e.g. 12,5,18"
                    className="h-9 focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-salvage">Manual salvage rolls (comma separated)</Label>
                  <Input
                    id="manual-salvage"
                    value={manualSalvageText}
                    onChange={(event) => setManualSalvageText(event.target.value)}
                    onBlur={() => handleManualQueueCommit("salvage")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleManualQueueCommit("salvage");
                      }
                    }}
                    placeholder="e.g. 7,16"
                    className="h-9 focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(focusRing, "h-9 px-3")}
                  onClick={handleSmokeTests}
                >
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> Smoke tests
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
                <p>
                  Recent rolls: {state.rolls.checks.length} main · {state.rolls.salvages.length} salvage.
                </p>
                <p>Manual queues fall back to random rolls if they run out mid-batch.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {statusMessage ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {statusMessage}
          </div>
        ) : null}

        <Tabs
          value={activeTier}
          onValueChange={(value) => setActiveTier(value as TierKey)}
          className="flex flex-col gap-4"
        >
          <TabsList className="grid auto-cols-fr grid-flow-col sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 backdrop-blur">
            {tierOrder.map((tier) => (
              <TabsTrigger
                key={tier}
                value={tier}
                className="rounded-none px-3 py-2 text-sm font-medium text-slate-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {tier}
              </TabsTrigger>
            ))}
          </TabsList>
          {tierOrder.map((tier) => (
            <TabsContent key={tier} value={tier} className="pt-4">
              {renderTierPanel(tier)}
            </TabsContent>
          ))}
        </Tabs>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg font-semibold text-slate-900">Recent checks</CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Latest main roll results with modifiers applied.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                {state.rolls.checks.length === 0 ? (
                  <p className="text-xs text-slate-500">No rolls yet.</p>
                ) : (
                  state.rolls.checks.map((roll) => (
                    <div
                      key={roll.id}
                      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                        <span>
                          {roll.tier} · {roll.risk}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-xs text-slate-900">
                        <span>
                          d20 {roll.raw} + {roll.modifier} = {roll.total}
                        </span>
                        <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                          {roll.success ? "✓" : "✗"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500">DC {roll.dc}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg font-semibold text-slate-900">Recent salvage</CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Salvage checks from failed attempts.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                {state.rolls.salvages.length === 0 ? (
                  <p className="text-xs text-slate-500">No salvage rolls yet.</p>
                ) : (
                  state.rolls.salvages.map((roll) => (
                    <div
                      key={roll.id}
                      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                        <span>
                          {roll.tier} · {roll.risk}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-xs text-slate-900">
                        <span>
                          d20 {roll.raw} + {roll.modifier} = {roll.total}
                        </span>
                        <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                          {roll.success ? "✓" : "✗"}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500">DC {roll.dc}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg font-semibold text-slate-900">Action log</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Latest attempts with resource deltas.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1 text-sm">
              {state.log.length === 0 ? (
                <p className="text-xs text-slate-500">No crafting actions yet.</p>
              ) : (
                state.log.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      <span>
                        {entry.tier === "system" ? "System" : `${entry.tier} · ${entry.risk}`}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{entry.text}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <DiceOverlay rolls={diceOverlay} />
    </TooltipProvider>
  );


}
