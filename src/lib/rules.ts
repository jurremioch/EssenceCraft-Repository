import { type AdvantageMode, chanceNormal, chanceWithAdvMode } from "@/lib/math";
import { naturalEssenceFamily } from "@/rules/natural";
import type {
  EssenceFamily,
  Inventory,
  ResourceDefinition,
  ResourceKey,
  RiskKey,
  RiskProfile,
  TierAction,
  TierKey,
  TierRisk,
} from "@/rules/types";

export type { Inventory, TierAction, TierKey } from "@/rules/types";
export type RiskLevel = RiskKey;

let activeFamily: EssenceFamily = naturalEssenceFamily;
let tierMap = new Map<TierKey, TierAction>();
let riskProfileMap = new Map<RiskLevel, RiskProfile>();

function syncDerivedState() {
  tierMap = new Map(activeFamily.tiers.map((tier) => [tier.key, tier]));
  riskProfileMap = new Map(activeFamily.riskProfiles.map((profile) => [profile.key, profile]));
}

syncDerivedState();

export function setActiveFamily(family: EssenceFamily) {
  activeFamily = family;
  syncDerivedState();
}

export function getActiveFamily(): EssenceFamily {
  return activeFamily;
}

export function getMinimumDc(): number {
  return activeFamily.minDc;
}

export function getResourceDefinitions(): ResourceDefinition[] {
  return activeFamily.resources;
}

export function getRiskProfiles(): RiskProfile[] {
  return activeFamily.riskProfiles;
}

export function getTierOrder(): TierKey[] {
  return activeFamily.tiers.map((tier) => tier.key);
}

export function createEmptyInventory(): Inventory {
  const inventory: Inventory = {};
  for (const resource of activeFamily.resources) {
    inventory[resource.key] = 0;
  }
  return inventory;
}

export const EMPTY_INVENTORY: Inventory = createEmptyInventory();

export interface SuccessProfile {
  dc: number;
  salvageDc?: number;
  salvageChance?: number;
  successChance: number;
}

export function getTierRule(tier: TierKey): TierAction {
  const rule = tierMap.get(tier);
  if (!rule) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  return rule;
}

export function getRiskRule(tier: TierKey, risk: RiskLevel): TierRisk {
  const tierRule = getTierRule(tier);
  const rule = tierRule.risks.find((entry) => entry.risk === risk);
  if (!rule) {
    throw new Error(`${tier} does not support ${risk} risk.`);
  }
  return rule;
}

export function getSupportedRisks(tier: TierKey): RiskLevel[] {
  const tierRule = getTierRule(tier);
  const available = new Set(tierRule.risks.map((risk) => risk.risk));
  const ordered: RiskLevel[] = activeFamily.riskProfiles
    .map((profile) => profile.key)
    .filter((key) => available.has(key));

  for (const risk of tierRule.risks) {
    if (!ordered.includes(risk.risk)) {
      ordered.push(risk.risk);
    }
  }

  return ordered;
}

export function computeDc(
  tier: TierKey,
  risk: RiskLevel,
  extraResource = 0,
): { dc: number; wastedExtra: number; reductionResource?: ResourceKey } {
  const riskRule = getRiskRule(tier, risk);
  const tierRule = getTierRule(tier);
  const reduction = tierRule.dcReduction;

  if (!reduction || extraResource <= 0) {
    return { dc: riskRule.dc, wastedExtra: 0, reductionResource: reduction?.resource };
  }

  const minDc = reduction.minDc ?? getMinimumDc();
  const perUnit = Math.max(1, reduction.perUnit);
  const maxReduction = Math.max(0, riskRule.dc - minDc);
  const maxExtraNeeded = Math.ceil(maxReduction / perUnit);
  const usedExtra = Math.min(extraResource, maxExtraNeeded);
  const dc = Math.max(minDc, riskRule.dc - usedExtra * perUnit);
  const wastedExtra = Math.max(0, extraResource - usedExtra);

  return { dc, wastedExtra, reductionResource: reduction.resource };
}

export function computeAttemptCost(
  tier: TierKey,
  risk: RiskLevel,
  extraResource = 0,
): Partial<Inventory> {
  const base = { ...getRiskRule(tier, risk).costs };
  const tierRule = getTierRule(tier);
  if (tierRule.dcReduction && extraResource > 0) {
    const resourceKey = tierRule.dcReduction.resource;
    base[resourceKey] = (base[resourceKey] ?? 0) + extraResource;
  }
  return base;
}

export function computeMaxAttempts(
  inventory: Inventory,
  tier: TierKey,
  risk: RiskLevel,
  extraResource = 0,
): number {
  const costs = computeAttemptCost(tier, risk, extraResource);
  const limits = Object.entries(costs)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => {
      const available = inventory[resource] ?? 0;
      return Math.floor(available / (amount ?? 1));
    });

  if (limits.length === 0) {
    return Infinity;
  }

  return Math.max(0, Math.min(...limits));
}

export function computeSuccessProfile(
  tier: TierKey,
  risk: RiskLevel,
  extraResource: number,
  modifier: number,
  advantage: AdvantageMode,
): SuccessProfile {
  const { dc } = computeDc(tier, risk, extraResource);
  const riskRule = getRiskRule(tier, risk);
  const successChance = chanceWithAdvMode(dc, modifier, advantage);
  const salvageChance = riskRule.salvage
    ? chanceNormal(riskRule.salvage.dc, modifier)
    : undefined;

  return {
    dc,
    successChance,
    salvageDc: riskRule.salvage?.dc,
    salvageChance,
  };
}

export function applyInventoryDelta(
  inventory: Inventory,
  delta: Partial<Inventory>,
): Inventory {
  const next = { ...inventory };
  for (const [key, amount] of Object.entries(delta)) {
    const typedKey = key as keyof Inventory;
    const current = next[typedKey] ?? 0;
    next[typedKey] = Math.max(0, Math.round(current + (amount ?? 0)));
  }

  return next;
}

export function runSmokeTests(): string[] {
  const messages: string[] = [];
  messages.push(`Active family: ${activeFamily.label} (${getTierOrder().length} tiers)`);

  for (const tier of getTierOrder()) {
    const tierRule = getTierRule(tier);
    const risks = getSupportedRisks(tier).map((risk) => riskProfileMap.get(risk)?.label ?? risk);
    messages.push(`${tierRule.label} supports risks: ${risks.join(", ")}`);
  }

  const reductionTier = activeFamily.tiers.find((tier) => tier.dcReduction);
  if (reductionTier) {
    const resource = reductionTier.dcReduction.resource;
    const { dc } = computeDc(reductionTier.key, reductionTier.risks[0].risk, 999);
    messages.push(
      `${reductionTier.key} DC clamps at ${dc} when stacking ${resource} (min ${getMinimumDc()})`,
    );
  }

  return messages;
}
