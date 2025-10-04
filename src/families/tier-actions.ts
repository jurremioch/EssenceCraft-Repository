import type { ActionOptions, ActionSpec, ResourceId, Risk } from "@/engine";

export interface TierActionState {
  risk?: Risk;
  extraCatalyst: number;
  inventory: Record<ResourceId, number>;
}

export interface TierAttemptOutcome {
  successDelta: Record<ResourceId, number>;
  failDelta: Record<ResourceId, number>;
}

export interface TierSalvageDefinition {
  dc: number | ((state: TierActionState) => number);
  returns: (state: TierActionState) => Record<ResourceId, number>;
}

export interface TierAction {
  key: ActionSpec["tier"];
  label: string;
  risks?: ActionSpec["risks"];
  options?: ActionOptions;
  inputs: (state: TierActionState) => Record<ResourceId, number>;
  salvage?: (state: TierActionState) => TierSalvageDefinition | null;
  dc: (state: TierActionState) => number;
  timeMinutes: (state: TierActionState) => number;
  attempt: (state: TierActionState) => TierAttemptOutcome;
}

export function createActionSpecFromTierAction(
  id: string,
  definition: TierAction,
): ActionSpec {
  const baseState: TierActionState = { risk: undefined, extraCatalyst: 0, inventory: {} };

  const baseTime = definition.risks
    ? Object.values(definition.risks)[0]?.timeMinutes ?? definition.timeMinutes(baseState)
    : definition.timeMinutes(baseState);

  return {
    id,
    name: definition.label,
    tier: definition.key,
    risks: definition.risks,
    dc: ({ risk, inputs }) => definition.dc({ risk, extraCatalyst: 0, inventory: inputs }),
    io: ({ risk, inputs }) => {
      const state: TierActionState = { risk, extraCatalyst: 0, inventory: inputs };
      const consume = definition.inputs(state);
      const attempt = definition.attempt(state);
      const salvageConfig = definition.salvage?.(state) ?? null;

      return {
        consume,
        produceOnSuccess: attempt.successDelta,
        salvage: salvageConfig
          ? {
              dc: typeof salvageConfig.dc === "function" ? salvageConfig.dc(state) : salvageConfig.dc,
              produce: salvageConfig.returns(state),
            }
          : undefined,
      };
    },
    options: definition.options
      ? {
          ...definition.options,
          custom: { ...(definition.options.custom ?? {}), tierAction: definition },
        }
      : { custom: { tierAction: definition } },
    timeMinutes: baseTime,
  };
}
