import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Calculator,
  Clock3,
  FlaskConical,
  Info,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

import { DiceOverlay } from "@/components/DiceOverlay";
import type { DiceFace } from "@/components/DiceOverlay";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AdvantageMode } from "@/lib/math";
import {
  EMPTY_INVENTORY,
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
import { loadState, saveState } from "@/lib/storage";
import { clampInt, d20, formatMinutes, parseCSVInts } from "@/lib/util";

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
  inventory: { ...EMPTY_INVENTORY },
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

const TIER_ORDER: TierKey[] = ["T2", "T3", "T4", "T5"];

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

export function NaturalEssenceCraftingApp() {
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
      inventory: { ...EMPTY_INVENTORY },
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
    const extraRawAE = tier === "T4" ? Math.max(0, t4ExtraRawAE) : 0;
    const attemptCosts = computeAttemptCost(tier, risk, extraRawAE);
    const feasible = computeMaxAttempts(state.inventory, tier, risk, extraRawAE);

    if (feasible <= 0) {
      setStatusMessage("Insufficient resources for that action.");
      setDiceOverlay(null);
      return;
    }

    const riskRule = getRiskRule(tier, risk);
    const { dc } = computeDc(tier, risk, extraRawAE);
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
        <Badge key={key} variant="secondary" className="bg-white/70 text-slate-700">
          {sign}{value.toFixed(2)} {RESOURCE_LABELS[key]}
        </Badge>
      );
    });

    return chips.length > 0 ? chips : <span className="text-sm text-slate-500">No net change</span>;
  };

  const renderTierPanel = (tier: TierKey) => {
    const rule = getTierRule(tier);
    const risk = riskSelections[tier];
    const attempts = attemptCounts[tier];
    const extraRawAE = tier === "T4" ? Math.max(0, t4ExtraRawAE) : 0;
    const { dc, wastedExtra } = computeDc(tier, risk, extraRawAE);
    const profile = computeSuccessProfile(tier, risk, extraRawAE, modifier, effectiveAdvantage);
    const salvageChance = profile.salvageChance;
    const feasible = computeMaxAttempts(state.inventory, tier, risk, extraRawAE);
    const riskRule = getRiskRule(tier, risk);
    const attemptCosts = computeAttemptCost(tier, risk, extraRawAE);
    const disabled = attempts < 1 || feasible <= 0 || attempts > feasible || !Number.isFinite(feasible);
    const totalTime = attempts * riskRule.timeMinutes;

    return (
      <Card className={`relative overflow-hidden bg-gradient-to-br ${rule.gradient}`}>
        <div className="pointer-events-none absolute inset-0 bg-white/75" />
        <div className="relative">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{rule.subtitle}</span>
              <Badge variant="secondary" className="bg-white/80 text-slate-700">
                {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
              </Badge>
            </CardTitle>
            <CardDescription>
              Time {riskRule.timeMinutes}m per attempt · DC {dc}
              {tier === "T4" && wastedExtra > 0 ? (
                <span className="ml-2 text-xs text-amber-600">
                  {wastedExtra} RawAE wasted beyond DC {MIN_DC}
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`${tier}-risk`}>Risk profile</Label>
                <Select
                  value={risk}
                  onValueChange={(value) =>
                    setRiskSelections((prev) => ({ ...prev, [tier]: value as RiskLevel }))
                  }
                >
                  <SelectTrigger id={`${tier}-risk`}>
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
              <div className="space-y-2">
                <Label htmlFor={`${tier}-attempts`}>Attempts</Label>
                <div className="flex items-center gap-2">
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
                  />
                  <Button
                    type="button"
                    variant="secondary"
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
                <p className="text-xs text-slate-500">Current max: {Number.isFinite(feasible) ? feasible : "∞"}</p>
              </div>
              {tier === "T4" ? (
                <div className="space-y-2">
                  <Label htmlFor="t4-extra">Extra RawAE / attempt</Label>
                  <Input
                    id="t4-extra"
                    type="number"
                    min={0}
                    value={t4ExtraRawAE}
                    onChange={(event) => setT4ExtraRawAE(Math.max(0, Math.round(Number(event.target.value))))}
                  />
                  <p className="text-xs text-slate-500">
                    Each RawAE lowers DC by 4 (min {MIN_DC}). Success yields {formatDelta(rule.success)}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Outcome</Label>
                  <p className="rounded-lg bg-white/60 px-3 py-2 text-sm">
                    Success yields {formatDelta(rule.success)}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="bg-white/80">
                      <Sparkles className="mr-1 h-4 w-4" />
                      Success {Math.round(profile.successChance * 100)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Chance for the main check with current modifier.</TooltipContent>
                </Tooltip>
                {salvageChance !== undefined ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-white/80">
                        <BadgeCheck className="mr-1 h-4 w-4" />
                        Salvage on fail {Math.round(salvageChance * 100)}%
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Salvage chance ignores advantage/disadvantage.</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="bg-white/80">
                      <Clock3 className="mr-1 h-4 w-4" />
                      {formatMinutes(totalTime)} total
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Time flavour for the requested batch.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Calculator className="h-4 w-4" /> Expected delta per attempt
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-slate-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Success, failure, and salvage chances combined into an average resource change per attempt.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex flex-wrap gap-2">
                {renderEvChips(tier, risk, extraRawAE, profile.successChance, salvageChance)}
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <Button
                type="button"
                onClick={() => runCrafting(tier)}
                disabled={disabled}
                variant={disabled ? "secondary" : "default"}
              >
                {disabled && attempts > feasible ? "Insufficient" : "Run"}
              </Button>
              <div className="text-xs text-slate-500">
                Consumes: {formatDelta(scaleDelta(attemptCosts, -1))}
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    );
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-900/95 pb-24 pt-10 text-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Natural Essence Crafting</span>
                  <FlaskConical className="h-6 w-6" />
                </CardTitle>
                <CardDescription className="text-slate-200">
                  Track inventory, roll checks, and keep your refinement pipeline humming.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-white/20 text-white">
                  Session {formatMinutes(state.sessionMinutes)}
                </Badge>
                <Badge variant="secondary" className="bg-white/20 text-white">
                  Log entries {state.log.length}
                </Badge>
                <Badge variant="secondary" className="bg-white/20 text-white">
                  Recent rolls {state.rolls.checks.length + state.rolls.salvages.length}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventory</CardTitle>
                <CardDescription>Editable counts. Crafting actions update automatically.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {RESOURCES.map((resource) => (
                  <div key={resource} className="space-y-1">
                    <Label htmlFor={`inv-${resource}`}>{RESOURCE_LABELS[resource]}</Label>
                    <Input
                      id={`inv-${resource}`}
                      type="number"
                      min={0}
                      value={state.inventory[resource]}
                      onChange={(event) =>
                        handleInventoryChange(resource, Math.max(0, Number(event.target.value)))
                      }
                    />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={handleUndo}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Undo
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleClear}>
                    <Trash2 className="mr-2 h-4 w-4" /> Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Settings & Rolls</CardTitle>
                <CardDescription>Configure modifier, rolling mode, and manual queues.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="space-y-1">
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
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white/80 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Auto rolling</p>
                      <p className="text-xs text-slate-500">Toggle manual queues for precise control.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Manual</span>
                      <Switch
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
                      <span className="text-xs text-slate-500">Auto</span>
                    </div>
                  </div>
                  <div className="space-y-1">
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
                      <SelectTrigger id="advantage">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="advantage">Advantage</SelectItem>
                        <SelectItem value="disadvantage">Disadvantage</SelectItem>
                      </SelectContent>
                    </Select>
                    {state.settings.rollMode === "manual" ? (
                      <p className="text-xs text-slate-500">Manual mode always rolls a single d20.</p>
                    ) : null}
                  </div>
                </div>

                <Separator />

                <div className="grid gap-3">
                  <div className="space-y-1">
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
                      placeholder="e.g. 12, 5, 18"
                    />
                  </div>
                  <div className="space-y-1">
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
                      placeholder="e.g. 7, 16"
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={handleSmokeTests}>
                    <Sparkles className="mr-2 h-4 w-4" /> Smoke tests
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600">
                  <p>Recent rolls: {state.rolls.checks.length} main · {state.rolls.salvages.length} salvage.</p>
                  <p>Manual queues auto-fallback to random rolls if they run out mid-batch.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {statusMessage ? (
            <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {statusMessage}
            </div>
          ) : null}

          <Tabs value={activeTier} onValueChange={(value) => setActiveTier(value as TierKey)}>
            <TabsList>
              {TIER_ORDER.map((tier) => (
                <TabsTrigger key={tier} value={tier}>
                  {tier}
                </TabsTrigger>
              ))}
            </TabsList>
            {TIER_ORDER.map((tier) => (
              <TabsContent key={tier} value={tier}>
                {renderTierPanel(tier)}
              </TabsContent>
            ))}
          </Tabs>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Rolls</CardTitle>
                <CardDescription>Main checks (left) and salvage rolls (right).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Checks</h4>
                    <div className="space-y-2 text-sm">
                      {state.rolls.checks.length === 0 ? (
                        <p className="text-slate-500">No rolls yet.</p>
                      ) : (
                        state.rolls.checks.map((roll) => (
                          <div key={roll.id} className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                              <span>
                                {roll.tier} {roll.risk}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="font-semibold text-slate-700">
                                d20 {roll.raw} + {roll.modifier} = {roll.total}
                              </span>
                              <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                                {roll.success ? "✓" : "✗"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">DC {roll.dc}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Salvage</h4>
                    <div className="space-y-2 text-sm">
                      {state.rolls.salvages.length === 0 ? (
                        <p className="text-slate-500">No salvage rolls yet.</p>
                      ) : (
                        state.rolls.salvages.map((roll) => (
                          <div key={roll.id} className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span>{new Date(roll.timestamp).toLocaleTimeString()}</span>
                              <span>
                                {roll.tier} {roll.risk}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="font-semibold text-slate-700">
                                d20 {roll.raw} + {roll.modifier} = {roll.total}
                              </span>
                              <span className={roll.success ? "text-emerald-600" : "text-rose-600"}>
                                {roll.success ? "✓" : "✗"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">DC {roll.dc}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Action Log</CardTitle>
                <CardDescription>Latest attempts with resource deltas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {state.log.length === 0 ? (
                  <p className="text-slate-500">No crafting actions yet.</p>
                ) : (
                  state.log.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span>{entry.tier === "system" ? "System" : `${entry.tier} ${entry.risk}`}</span>
                      </div>
                      <p className="mt-1 text-slate-700">{entry.text}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <DiceOverlay rolls={diceOverlay} />
      </div>
    </TooltipProvider>
  );
}
