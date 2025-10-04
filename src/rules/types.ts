export type ResourceKey = string;
export type TierKey = string;
export type RiskKey = string;

export type Inventory = Record<ResourceKey, number>;

export interface ResourceDefinition {
  key: ResourceKey;
  label: string;
}

export interface RiskProfile {
  key: RiskKey;
  label: string;
  description?: string;
}

export interface SalvageRule {
  dc: number;
  returns: Partial<Inventory>;
}

export interface TierRisk {
  risk: RiskKey;
  dc: number;
  costs: Partial<Inventory>;
  timeMinutes: number;
  salvage?: SalvageRule;
}

export interface DcReductionRule {
  resource: ResourceKey;
  perUnit: number;
  minDc: number;
}

export interface TierAction {
  key: TierKey;
  label: string;
  subtitle: string;
  gradient: string;
  success: Partial<Inventory>;
  risks: TierRisk[];
  dcReduction?: DcReductionRule;
}

export interface EssenceFamily {
  key: string;
  label: string;
  description?: string;
  minDc: number;
  resources: ResourceDefinition[];
  riskProfiles: RiskProfile[];
  tiers: TierAction[];
}
