import { applyDcReduction, rollD20, rollWithMode } from "./math";
import type { ActionSpec, ResourceId, Risk, RollMode } from "./types";

export interface AttemptContext {
  action: ActionSpec;
  inventory: Record<ResourceId, number>;
  modifier: number;
  mode: RollMode;
  risk?: Risk;
  extraCatalyst?: number;
  random?: () => number;
  salvageRandom?: () => number;
}

export interface CheckResult {
  raw: number;
  detail: number[];
  modifier: number;
  total: number;
  dc: number;
  mode: RollMode;
  success: boolean;
}

export interface SalvageResult {
  attempted: boolean;
  raw?: number;
  modifier: number;
  total?: number;
  dc?: number;
  success?: boolean;
}

export interface AttemptResult {
  feasible: boolean;
  reason?: "insufficient-resources";
  inventory: Record<ResourceId, number>;
  delta: Record<ResourceId, number>;
  consumed: Record<ResourceId, number>;
  produced: Record<ResourceId, number>;
  salvageProduced: Record<ResourceId, number>;
  check?: CheckResult;
  salvage?: SalvageResult;
  timeMinutes: number;
}

export interface ActionPreview {
  dc: number;
  timeMinutes: number;
  consumption: Record<ResourceId, number>;
  io: ReturnType<ActionSpec["io"]>;
}

export function previewAction(
  action: ActionSpec,
  inventory: Record<ResourceId, number>,
  risk: Risk | undefined,
  extraCatalyst = 0,
): ActionPreview {
  const resolvedRisk = resolveRisk(action, risk);
  const { baseDc, timeMinutes } = resolveDcAndTime(action, resolvedRisk, inventory);
  const io = action.io({ risk: resolvedRisk, inputs: inventory });
  const consumption = withExtraCatalystConsumption(action, io.consume, extraCatalyst);
  const dc = applyReduction(action, baseDc, extraCatalyst);
  return {
    dc,
    timeMinutes,
    consumption,
    io,
  };
}

export interface BatchResult {
  attempts: AttemptResult[];
  summary: {
    runs: number;
    totalMinutes: number;
    delta: Record<ResourceId, number>;
  };
  finalInventory: Record<ResourceId, number>;
}

export function simulateAttempt({
  action,
  inventory,
  modifier,
  mode,
  risk,
  extraCatalyst = 0,
  random,
  salvageRandom,
}: AttemptContext): AttemptResult {
  const currentInventory = cloneInventory(inventory);
  const resolvedRisk = resolveRisk(action, risk);
  const { baseDc, timeMinutes } = resolveDcAndTime(action, resolvedRisk, currentInventory);
  const actualDc = applyReduction(action, baseDc, extraCatalyst);
  const actionIO = action.io({ risk: resolvedRisk, inputs: currentInventory });
  const consumption = withExtraCatalystConsumption(action, actionIO.consume, extraCatalyst);

  if (!isFeasible(currentInventory, consumption)) {
    return {
      feasible: false,
      reason: "insufficient-resources",
      inventory: currentInventory,
      delta: {},
      consumed: {},
      produced: {},
      salvageProduced: {},
      timeMinutes,
    };
  }

  const delta: Record<ResourceId, number> = {};
  mergeDelta(delta, negateRecord(consumption));

  const checkRoll = rollWithMode(mode, random ?? Math.random);
  const total = checkRoll.raw + modifier;
  const success = total >= actualDc;
  const producedOnSuccess = success ? actionIO.produceOnSuccess : {};
  mergeDelta(delta, producedOnSuccess);

  const check: CheckResult = {
    raw: checkRoll.raw,
    detail: checkRoll.detail,
    modifier,
    total,
    dc: actualDc,
    mode,
    success,
  };

  let salvage: SalvageResult | undefined;
  const salvageDelta: Record<ResourceId, number> = {};

  if (!success && actionIO.salvage) {
    const roll = rollD20(salvageRandom ?? random ?? Math.random);
    const salvageTotal = roll + modifier;
    const salvageSuccess = salvageTotal >= actionIO.salvage.dc;
    salvage = {
      attempted: true,
      raw: roll,
      modifier,
      total: salvageTotal,
      dc: actionIO.salvage.dc,
      success: salvageSuccess,
    };
    if (salvageSuccess) {
      mergeDelta(delta, actionIO.salvage.produce);
      mergeDelta(salvageDelta, actionIO.salvage.produce);
    }
  } else {
    salvage = { attempted: false, modifier };
  }

  const finalInventory = applyToInventory(cloneInventory(currentInventory), delta);

  return {
    feasible: true,
    inventory: finalInventory,
    delta,
    consumed: consumption,
    produced: producedOnSuccess,
    salvageProduced: salvageDelta,
    check,
    salvage,
    timeMinutes,
  };
}

export function simulateBatch(
  ctx: AttemptContext,
  attempts: number,
): BatchResult {
  const results: AttemptResult[] = [];
  let inventory = cloneInventory(ctx.inventory);
  let totalMinutes = 0;
  const totalDelta: Record<ResourceId, number> = {};

  for (let i = 0; i < attempts; i += 1) {
    const result = simulateAttempt({ ...ctx, inventory });
    if (!result.feasible) {
      break;
    }
    results.push(result);
    inventory = result.inventory;
    totalMinutes += result.timeMinutes;
    mergeDelta(totalDelta, result.delta);
  }

  return {
    attempts: results,
    summary: {
      runs: results.length,
      totalMinutes,
      delta: totalDelta,
    },
    finalInventory: inventory,
  };
}

export function maxFeasibleAttempts(
  action: ActionSpec,
  inventory: Record<ResourceId, number>,
  risk: Risk | undefined,
  extraCatalyst = 0,
): number {
  const resolvedRisk = resolveRisk(action, risk);
  const actionIO = action.io({ risk: resolvedRisk, inputs: inventory });
  const consumption = withExtraCatalystConsumption(action, actionIO.consume, extraCatalyst);
  const limits = Object.entries(consumption)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => {
      const available = inventory[resource] ?? 0;
      return Math.floor(available / (amount ?? 1));
    });

  if (limits.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.min(...limits));
}

function resolveRisk(action: ActionSpec, risk?: Risk): Risk | undefined {
  if (!action.risks) {
    return risk;
  }

  if (risk && action.risks[risk]) {
    return risk;
  }

  const available = Object.keys(action.risks) as Risk[];
  return available[0];
}

function resolveDcAndTime(
  action: ActionSpec,
  risk: Risk | undefined,
  inputs: Record<ResourceId, number>,
): {
  baseDc: number;
  timeMinutes: number;
} {
  if (risk && action.risks?.[risk]) {
    const entry = action.risks[risk]!;
    return {
      baseDc: entry.dc,
      timeMinutes: entry.timeMinutes ?? action.timeMinutes,
    };
  }

  if (typeof action.dc === "function") {
    return { baseDc: action.dc({ risk, inputs }), timeMinutes: action.timeMinutes };
  }

  if (typeof action.dc === "number") {
    return { baseDc: action.dc, timeMinutes: action.timeMinutes };
  }

  throw new Error(`Unable to resolve DC for action ${action.id}`);
}

function applyReduction(action: ActionSpec, baseDc: number, extraCatalyst: number): number {
  if (!action.options?.dcReduction) {
    return baseDc;
  }

  return applyDcReduction(
    baseDc,
    extraCatalyst,
    action.options.dcReduction.perUnit,
    action.options.dcReduction.minDC,
  );
}

function withExtraCatalystConsumption(
  action: ActionSpec,
  consume: Record<ResourceId, number>,
  extraCatalyst: number,
): Record<ResourceId, number> {
  const next: Record<ResourceId, number> = { ...consume };
  if (extraCatalyst > 0 && action.options?.dcReduction) {
    const key = action.options.dcReduction.resource;
    next[key] = (next[key] ?? 0) + extraCatalyst;
  }
  return next;
}

function isFeasible(
  inventory: Record<ResourceId, number>,
  consumption: Record<ResourceId, number>,
): boolean {
  return Object.entries(consumption).every(([resource, amount]) => {
    if (!amount) {
      return true;
    }
    const available = inventory[resource] ?? 0;
    return available >= amount;
  });
}

function mergeDelta(
  target: Record<ResourceId, number>,
  delta: Record<ResourceId, number>,
): Record<ResourceId, number> {
  for (const [resource, amount] of Object.entries(delta)) {
    if (!amount) continue;
    target[resource] = (target[resource] ?? 0) + amount;
  }
  return target;
}

function applyToInventory(
  inventory: Record<ResourceId, number>,
  delta: Record<ResourceId, number>,
): Record<ResourceId, number> {
  for (const [resource, amount] of Object.entries(delta)) {
    if (!amount) continue;
    inventory[resource] = Math.max(0, (inventory[resource] ?? 0) + amount);
  }
  return inventory;
}

function negateRecord(record: Record<ResourceId, number>): Record<ResourceId, number> {
  const next: Record<ResourceId, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!value) continue;
    next[key] = -value;
  }
  return next;
}

function cloneInventory(
  inventory: Record<ResourceId, number>,
): Record<ResourceId, number> {
  return { ...inventory };
}
