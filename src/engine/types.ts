export type ResourceId = string;

export type Risk = "low" | "standard" | "high" | (string & {});

export type RollMode = "normal" | "adv" | "dis";

export interface RollContext {
  dc: number;
  mod: number;
  mode: RollMode;
}

export interface ActionIO {
  consume: Record<ResourceId, number>;
  produceOnSuccess: Record<ResourceId, number>;
  salvage?: {
    dc: number;
    produce: Record<ResourceId, number>;
  };
}

export interface ActionOptions {
  allowExtraCatalyst?: boolean;
  dcReduction?: {
    perUnit: number;
    minDC: number;
    resource: ResourceId;
  };
  custom?: Record<string, unknown>;
}

export type DcValue = number | ((ctx: { risk?: Risk; inputs: Record<ResourceId, number> }) => number);

export interface ActionSpec {
  id: string;
  name: string;
  tier: "T2" | "T3" | "T4" | "T5";
  risks?: Partial<Record<Risk, { dc: number; timeMinutes?: number }>>;
  dc?: DcValue;
  io: (ctx: { risk?: Risk; inputs: Record<ResourceId, number> }) => ActionIO;
  options?: ActionOptions;
  timeMinutes: number;
}

export interface FamilyDefinition {
  id: string;
  name: string;
  resources: ResourceId[];
  resourceLabels?: Record<ResourceId, string>;
  actions: ActionSpec[];
  defaults?: {
    risks?: Risk[];
  };
}

export type Registry = Map<string, FamilyDefinition>;
