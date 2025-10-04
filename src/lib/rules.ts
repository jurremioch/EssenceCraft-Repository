import { type AdvantageMode, chanceWithAdvMode, chanceNormal } from "@/lib/math";

export const MIN_DC = 5;

export type RiskLevel = "low" | "standard" | "high";
export type TierKey = "T2" | "T3" | "T4" | "T5";

export interface Inventory {
  raw: number;
  fine: number;
  fused: number;
  superior: number;
  supreme: number;
  rawAE: number;
}

export interface SalvageRule {
  dc: number;
  returns: Partial<Inventory>;
}

export interface RiskRule {
  dc: number;
  costs: Partial<Inventory>;
  timeMinutes: number;
  salvage?: SalvageRule;
}

export interface TierRule {
  label: string;
  subtitle: string;
  gradient: string;
  success: Partial<Inventory>;
  risks: Partial<Record<RiskLevel, RiskRule>>;
  allowExtraRawAE?: boolean;
}

export const EMPTY_INVENTORY: Inventory = {
  raw: 0,
  fine: 0,
  fused: 0,
  superior: 0,
  supreme: 0,
  rawAE: 0,
};

export const TIER_RULES: Record<TierKey, TierRule> = {
  T2: {
    label: "Tier 2 · Fine Essence",
    subtitle: "Refine Raw → Fine",
    gradient: "from-tier-2-start/20 via-tier-2-start/10 to-tier-2-end/5",
    success: { fine: 1 },
    risks: {
      low: {
        dc: 5,
        costs: { raw: 3 },
        salvage: { dc: 8, returns: { raw: 2 } },
        timeMinutes: 30,
      },
      standard: {
        dc: 12,
        costs: { raw: 2 },
        salvage: { dc: 12, returns: { raw: 1 } },
        timeMinutes: 60,
      },
      high: {
        dc: 20,
        costs: { raw: 1 },
        timeMinutes: 120,
      },
    },
  },
  T3: {
    label: "Tier 3 · Fused Essence",
    subtitle: "Infuse Fine + RawAE → Fused",
    gradient: "from-tier-3-start/20 via-tier-3-start/10 to-tier-3-end/5",
    success: { fused: 1 },
    risks: {
      standard: {
        dc: 12,
        costs: { fine: 2, rawAE: 2 },
        salvage: { dc: 10, returns: { fine: 2 } },
        timeMinutes: 30,
      },
    },
  },
  T4: {
    label: "Tier 4 · Superior Essence",
    subtitle: "Refine Fused (+RawAE) → Superior",
    gradient: "from-tier-4-start/20 via-tier-4-start/10 to-tier-4-end/5",
    success: { superior: 1 },
    allowExtraRawAE: true,
    risks: {
      low: {
        dc: 12,
        costs: { fused: 3 },
        salvage: { dc: 10, returns: { fine: 5 } },
        timeMinutes: 60,
      },
      standard: {
        dc: 18,
        costs: { fused: 2 },
        salvage: { dc: 14, returns: { fine: 3 } },
        timeMinutes: 120,
      },
      high: {
        dc: 34,
        costs: { fused: 1 },
        salvage: { dc: 18, returns: { fine: 1 } },
        timeMinutes: 480,
      },
    },
  },
  T5: {
    label: "Tier 5 · Supreme Essence",
    subtitle: "Refine Superior → Supreme",
    gradient: "from-tier-5-start/30 via-tier-5-start/15 to-tier-5-end/5",
    success: { supreme: 1 },
    risks: {
      standard: {
        dc: 12,
        costs: { superior: 3 },
        salvage: { dc: 10, returns: { superior: 2 } },
        timeMinutes: 60,
      },
      high: {
        dc: 18,
        costs: { superior: 2 },
        salvage: { dc: 15, returns: { superior: 1 } },
        timeMinutes: 120,
      },
    },
  },
};

export interface SuccessProfile {
  dc: number;
  salvageDc?: number;
  salvageChance?: number;
  successChance: number;
}

export function getTierRule(tier: TierKey): TierRule {
  return TIER_RULES[tier];
}

export function getRiskRule(tier: TierKey, risk: RiskLevel): RiskRule {
  const tierRule = getTierRule(tier);
  const riskRule = tierRule.risks[risk];
  if (!riskRule) {
    throw new Error(`${tier} does not support ${risk} risk.`);
  }

  return riskRule;
}

export function getSupportedRisks(tier: TierKey): RiskLevel[] {
  return Object.keys(getTierRule(tier).risks) as RiskLevel[];
}

export function computeDc(
  tier: TierKey,
  risk: RiskLevel,
  extraRawAE: number,
): { dc: number; wastedExtra: number } {
  const riskRule = getRiskRule(tier, risk);
  if (tier !== "T4") {
    return { dc: riskRule.dc, wastedExtra: 0 };
  }

  const maxReduction = Math.max(0, riskRule.dc - MIN_DC);
  const maxExtraNeeded = Math.ceil(maxReduction / 4);
  const usedExtra = Math.min(extraRawAE, maxExtraNeeded);
  const dc = Math.max(MIN_DC, riskRule.dc - usedExtra * 4);
  const wastedExtra = Math.max(0, extraRawAE - usedExtra);

  return { dc, wastedExtra };
}

export function computeAttemptCost(
  tier: TierKey,
  risk: RiskLevel,
  extraRawAE: number,
): Partial<Inventory> {
  const base = { ...getRiskRule(tier, risk).costs };
  if (tier === "T4" && extraRawAE > 0) {
    base.rawAE = (base.rawAE ?? 0) + extraRawAE;
  }

  return base;
}

export function computeMaxAttempts(
  inventory: Inventory,
  tier: TierKey,
  risk: RiskLevel,
  extraRawAE: number,
): number {
  const costs = computeAttemptCost(tier, risk, extraRawAE);
  const limits = Object.entries(costs)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => {
      const available = inventory[resource as keyof Inventory] ?? 0;
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
  extraRawAE: number,
  modifier: number,
  advantage: AdvantageMode,
): SuccessProfile {
  const { dc } = computeDc(tier, risk, extraRawAE);
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
    next[typedKey] = Math.max(0, Math.round((next[typedKey] ?? 0) + (amount ?? 0)));
  }

  return next;
}

export function runSmokeTests(): string[] {
  const messages: string[] = [];
  for (const tier of Object.keys(TIER_RULES) as TierKey[]) {
    const risks = getSupportedRisks(tier);
    messages.push(`${tier} supports risks: ${risks.join(", ")}`);
  }

  const { dc } = computeDc("T4", "high", 10);
  messages.push(`T4 high DC clamps to ${dc}`);

  return messages;
}
