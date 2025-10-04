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
  MIN_DC,
  applyInventoryDelta,
  computeAttemptCost,
  computeDc,
  computeMaxAttempts,
  computeSuccessProfile,
  getRiskRule,
  getSupportedRisks,
  getTierRule,
  runSmokeTests,
} from "@/lib/rules";
import type { Inventory, RiskLevel, TierKey } from "@/lib/rules";
import {
  type ActionLogEntry,
  type RollRecord,
  useNaturalEssenceStore,
} from "@/app/store";
import { clampInt, cn, d20, formatMinutes, parseCSVInts } from "@/lib/util";

const RESOURCES: (keyof Inventory)[] = [
  "raw",
  "fine",
  "fused",
  "superior",
  "supreme",
  "rawAE",
];

const RESOURCE_LABELS: Record<keyof Inventory, string> = {
  raw: "T1 Raw",
  fine: "T2 Fine",
  fused: "T3 Fused",
  superior: "T4 Superior",
  supreme: "T5 Supreme",
  rawAE: "Raw Arcane Essence",
};

const TIER_ORDER: TierKey[] = ["T2", "T3", "T4", "T5"];

const TIER_GRADIENTS: Record<TierKey, string> = {
  T2: "from-emerald-400 to-emerald-600",
  T3: "from-sky-400 to-sky-600",
  T4: "from-violet-400 to-violet-600",
  T5: "from-amber-400 to-amber-600",
};

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

function diffInventory(before: Inventory, after: Inventory): Partial<Inventory> {
  const delta: Partial<Inventory> = {};
  for (const key of RESOURCES) {
    const change = after[key] - before[key];
    if (change !== 0) {
      delta[key] = change;
    }
  }
  return delta;
}

function formatDelta(delta: Partial<Inventory>): string {
  const parts: string[] = [];
  for (const key of RESOURCES) {
    const amount = delta[key];
    if (!amount) continue;
    const sign = amount > 0 ? "+" : "";
    parts.push(`${sign}${amount} ${RESOURCE_LABELS[key]}`);
  }
  return parts.length > 0 ? parts.join(", ") : "no change";
}

function cloneInventory(inventory: Inventory): Inventory {
  return { ...inventory };
}

function scaleDelta(delta: Partial<Inventory>, factor: number): Partial<Inventory> {
  const scaled: Partial<Inventory> = {};
  for (const key of RESOURCES) {
    const value = delta[key];
    if (!value) continue;
    scaled[key] = value * factor;
  }
  return scaled;
}

function mergeDeltas(...deltas: Partial<Inventory>[]): Partial<Inventory> {
  const result: Partial<Inventory> = {};
  for (const delta of deltas) {
    for (const key of RESOURCES) {
      const value = delta[key];
      if (!value) continue;
      result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

export function NaturalEssenceCraftingApp({
  compactMode,
  onToggleCompactMode,
}: NaturalEssenceCraftingAppProps) {
  const inventory = useNaturalEssenceStore((store) => store.inventory);
  const settings = useNaturalEssenceStore((store) => store.settings);
  const log = useNaturalEssenceStore((store) => store.log);
  const rolls = useNaturalEssenceStore((store) => store.rolls);
  const sessionMinutes = useNaturalEssenceStore((store) => store.sessionMinutes);
  const statusMessage = useNaturalEssenceStore((store) => store.statusMessage);
  const setInventoryValue = useNaturalEssenceStore(
    (store) => store.setInventoryValue,
  );
  const snapshotInventory = useNaturalEssenceStore(
    (store) => store.snapshotInventory,
  );
  const restoreInventory = useNaturalEssenceStore((store) => store.restoreInventory);
  const clearInventory = useNaturalEssenceStore((store) => store.clearInventory);
  const updateManualQueue = useNaturalEssenceStore(
    (store) => store.updateManualQueue,
  );
  const appendLogEntries = useNaturalEssenceStore(
    (store) => store.appendLogEntries,
  );
  const commitCraftingResult = useNaturalEssenceStore(
    (store) => store.commitCraftingResult,
  );
  const updateSettings = useNaturalEssenceStore((store) => store.updateSettings);
  const setStatusMessage = useNaturalEssenceStore(
    (store) => store.setStatusMessage,
  );
  const [activeTier, setActiveTier] = useState<TierKey>("T2");
  const [attemptCounts, setAttemptCounts] = useState<Record<TierKey, number>>({
    T2: 1,
    T3: 1,
    T4: 1,
    T5: 1,
  });
  const [riskSelections, setRiskSelections] = useState<Record<TierKey, RiskLevel>>({
    T2: "standard",
    T3: "standard",
    T4: "standard",
    T5: "standard",
  });
  const [t4ExtraRawAE, setT4ExtraRawAE] = useState(0);
  const [diceOverlay, setDiceOverlay] = useState<DiceFace[] | null>(null);
  const [manualCheckText, setManualCheckText] = useState<string>("");
  const [manualSalvageText, setManualSalvageText] = useState<string>("");

  useEffect(() => {
    setManualCheckText(settings.manualCheckQueue.join(", "));
  }, [settings.manualCheckQueue]);

  useEffect(() => {
    setManualSalvageText(settings.manualSalvageQueue.join(", "));
  }, [settings.manualSalvageQueue]);

  const modifier = settings.modifier;
  const effectiveAdvantage: AdvantageMode =
    settings.rollMode === "auto" ? settings.advantage : "normal";

  const handleInventoryChange = (key: keyof Inventory, value: number) => {
    setInventoryValue(key, value);
  };

  const handleManualQueueCommit = (type: "check" | "salvage") => {
    const text = type === "check" ? manualCheckText : manualSalvageText;
    const parsed = parseCSVInts(text);
    updateManualQueue(type, parsed);
  };

  const handleUndo = () => {
    const restored = restoreInventory();
    if (!restored) {
      setStatusMessage("Nothing to undo yet.");
      return;
    }

    setStatusMessage("Inventory restored to previous snapshot.");
  };

  const handleClear = () => {
    clearInventory();
    setStatusMessage("Inventory cleared.");
    setDiceOverlay(null);
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

    appendLogEntries(entries);
    setStatusMessage("Smoke tests appended to the log.");
  };

  const runCrafting = (tier: TierKey) => {
    const attemptsRequested = Math.max(1, attemptCounts[tier] ?? 1);
    const risk = riskSelections[tier];
    const extraRawAE = tier === "T4" ? Math.max(0, t4ExtraRawAE) : 0;
    const attemptCosts = computeAttemptCost(tier, risk, extraRawAE);
    const feasible = computeMaxAttempts(inventory, tier, risk, extraRawAE);

    if (feasible <= 0) {
      setStatusMessage("Insufficient resources for that action.");
      setDiceOverlay(null);
      return;
    }

    const riskRule = getRiskRule(tier, risk);
    const { dc } = computeDc(tier, risk, extraRawAE);
    const manualChecks = [...settings.manualCheckQueue];
    const manualSalvages = [...settings.manualSalvageQueue];
    let workingInventory = cloneInventory(inventory);
    const baseInventory = cloneInventory(inventory);
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
      if (settings.rollMode === "manual") {
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
        workingInventory = applyInventoryDelta(workingInventory, getTierRule(tier).success);
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
        const salvageRoll = settings.rollMode === "manual"
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
      const delta = diffInventory(before, after);
      const entry: ActionLogEntry = {
        id: `${now.getTime()}-${tier}-${i}`,
        timestamp: now.toISOString(),
        tier,
        risk,
        text: `${tier} ${risk} ${success ? "success" : "failure"} (${total} vs DC ${dc}) — ${formatDelta(delta)}${salvageInfo ? `. ${salvageInfo}` : ""}`,
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

    snapshotInventory(baseInventory);
    commitCraftingResult({
      inventory: workingInventory,
      checks: newChecks,
      salvages: newSalvages,
      logEntries: newLog,
      manualChecks,
      manualSalvages,
      minutes: totalMinutes,
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
    extraRawAE: number,
    successChance: number,
    salvageChance: number | undefined,
  ) => {
    const costs = computeAttemptCost(tier, risk, extraRawAE);
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

    const chips = RESOURCES.filter((key) => (expected[key] ?? 0) !== 0).map((key) => {
      const value = expected[key] ?? 0;
      const sign = value > 0 ? "+" : "";
      return (
        <Chip key={key} ok={value >= 0}>
          {sign}
          {value.toFixed(2)} {RESOURCE_LABELS[key]}
        </Chip>
      );
    });

    return chips.length > 0 ? chips : <span className="text-xs text-slate-500">No net change</span>;
  };

  const renderTierPanel = (tier: TierKey) => {
    const rule = getTierRule(tier);
    const risk = riskSelections[tier];
    const attempts = Math.max(1, attemptCounts[tier]);
    const extraRawAE = tier === "T4" ? Math.max(0, t4ExtraRawAE) : 0;
    const { dc, wastedExtra } = computeDc(tier, risk, extraRawAE);
    const profile = computeSuccessProfile(
      tier,
      risk,
      extraRawAE,
      modifier,
      effectiveAdvantage,
    );
    const salvageChance = profile.salvageChance;
    const feasible = computeMaxAttempts(inventory, tier, risk, extraRawAE);
    const riskRule = getRiskRule(tier, risk);
    const attemptCosts = computeAttemptCost(tier, risk, extraRawAE);
    const totalTime = attempts * riskRule.timeMinutes;

    const missingResources = RESOURCES.flatMap((resource) => {
      const perAttempt = attemptCosts[resource] ?? 0;
      if (!perAttempt) return [];
      const need = perAttempt * attempts;
      const have = inventory[resource] ?? 0;
      const shortfall = need - have;
      return shortfall > 0 ? [`${shortfall} more ${RESOURCE_LABELS[resource]}`] : [];
    }).join(", ");

    let disabledReason: string | null = null;
    if (attempts < 1) {
      disabledReason = "Enter at least one attempt.";
    } else if (feasible <= 0) {
      disabledReason = missingResources || "Not enough resources for an attempt.";
    } else if (Number.isFinite(feasible) && attempts > feasible) {
      disabledReason = missingResources || "Reduce attempts or add resources.";
    }

    const requirementChips = RESOURCES.flatMap((resource) => {
      const perAttempt = attemptCosts[resource];
      if (!perAttempt) return [];
      const need = perAttempt * attempts;
      const have = inventory[resource] ?? 0;
      const enough = have >= need;
      return [
        <Chip
          key={resource}
          ok={enough}
          title={`Need ${need} ${RESOURCE_LABELS[resource]} (have ${have}) for this batch`}
        >
          Need {need} {RESOURCE_LABELS[resource]}
        </Chip>,
      ];
    });

    const consumesPerAttempt = RESOURCES.flatMap((resource) => {
      const value = attemptCosts[resource];
      if (!value) return [];
      return [
        <Chip
          key={`consume-${resource}`}
          ok={false}
          className="flex items-center gap-1"
          title={`Consumes ${value} ${RESOURCE_LABELS[resource]} per attempt`}
        >
          <PackageMinus className="h-3 w-3" aria-hidden="true" />-{value} {RESOURCE_LABELS[resource]}
        </Chip>,
      ];
    });

    const producesOnSuccess = RESOURCES.flatMap((resource) => {
      const value = rule.success[resource];
      if (!value) return [];
      return [
        <Chip
          key={`produce-${resource}`}
          ok
          className="flex items-center gap-1"
          title={`On success gain ${value} ${RESOURCE_LABELS[resource]}`}
        >
          <PackagePlus className="h-3 w-3" aria-hidden="true" />+{value} {RESOURCE_LABELS[resource]}
        </Chip>,
      ];
    });

    const consumptionSummary = RESOURCES.flatMap((resource) => {
      const value = attemptCosts[resource];
      if (!value) return [];
      return [`${value} ${RESOURCE_LABELS[resource]}`];
    }).join(", ");

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
              className={`bg-gradient-to-r ${TIER_GRADIENTS[tier]} bg-clip-text text-transparent`}
            >
              {rule.subtitle}
            </span>
          </CardTitle>
          <CardDescription className="text-[11px] text-slate-500">
            {riskRule.timeMinutes} minutes per attempt · DC {dc}
            {tier === "T4" && wastedExtra > 0 ? (
              <span className="ml-1 text-amber-600">
                {wastedExtra} RawAE wasted beyond DC {MIN_DC}
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
                        {option.charAt(0).toUpperCase() + option.slice(1)}
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

              {tier === "T4" ? (
                <div className="space-y-1">
                  <Label htmlFor="t4-extra">Extra RawAE per attempt</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Decrease extra RawAE"
                      className={cn(focusRing, "h-9 w-9 p-0")}
                      onClick={() => setT4ExtraRawAE((prev) => Math.max(0, prev - 1))}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Input
                      id="t4-extra"
                      type="number"
                      min={0}
                      value={t4ExtraRawAE}
                      onChange={(event) =>
                        setT4ExtraRawAE(Math.max(0, Math.round(Number(event.target.value))))
                      }
                      className="h-9 w-24 text-center focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Increase extra RawAE"
                      className={cn(focusRing, "h-9 w-9 p-0")}
                      onClick={() => setT4ExtraRawAE((prev) => prev + 1)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <p className="text-[11px] text-slate-500">
                      Lowers DC by 4 each (minimum {MIN_DC}).
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
                  {renderEvChips(tier, risk, extraRawAE, profile.successChance, salvageChance)}
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
              <h1 className="text-2xl font-semibold text-slate-900">Natural essence crafting</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip className="border-slate-200 bg-white text-slate-700" title="Session duration">
                Session {formatMinutes(sessionMinutes)}
              </Chip>
              <Chip className="border-slate-200 bg-white text-slate-700" title="Log entries recorded">
                Log {log.length}
              </Chip>
              <Chip className="border-slate-200 bg-white text-slate-700" title="Total recent rolls tracked">
                Rolls {rolls.checks.length + rolls.salvages.length}
              </Chip>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Track inventory, roll checks, and keep your refinement pipeline humming.
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
                {RESOURCES.map((resource) => (
                  <div key={resource} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`inv-${resource}`} className="text-sm font-medium text-slate-600">
                      {RESOURCE_LABELS[resource]}
                    </Label>
                    <Input
                      id={`inv-${resource}`}
                      type="number"
                      min={0}
                      value={inventory[resource]}
                      onChange={(event) =>
                        handleInventoryChange(resource, Math.max(0, Number(event.target.value)))
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
                      updateSettings({
                        modifier: Number(event.target.value) || 0,
                      })
                    }
                    className="h-9 w-24 focus-visible:ring-2 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="advantage">Main check mode</Label>
                  <Select
                    value={settings.advantage}
                    onValueChange={(value) =>
                      updateSettings({
                        advantage: value as AdvantageMode,
                      })
                    }
                    disabled={settings.rollMode === "manual"}
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
                  {settings.rollMode === "manual" ? (
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
                        checked={settings.rollMode === "auto"}
                        onCheckedChange={(checked) =>
                          updateSettings({ rollMode: checked ? "auto" : "manual" })
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
                  Recent rolls: {rolls.checks.length} main · {rolls.salvages.length} salvage.
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
          <TabsList className="grid grid-cols-4 sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 backdrop-blur">
            {TIER_ORDER.map((tier) => (
              <TabsTrigger
                key={tier}
                value={tier}
                className="rounded-none px-3 py-2 text-sm font-medium text-slate-600 data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {tier}
              </TabsTrigger>
            ))}
          </TabsList>
          {TIER_ORDER.map((tier) => (
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
                {rolls.checks.length === 0 ? (
                  <p className="text-xs text-slate-500">No rolls yet.</p>
                ) : (
                  rolls.checks.map((roll) => (
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
                {rolls.salvages.length === 0 ? (
                  <p className="text-xs text-slate-500">No salvage rolls yet.</p>
                ) : (
                  rolls.salvages.map((roll) => (
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
              {log.length === 0 ? (
                <p className="text-xs text-slate-500">No crafting actions yet.</p>
              ) : (
                log.map((entry) => (
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
