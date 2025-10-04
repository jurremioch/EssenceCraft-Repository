import type { ActionSpec, FamilyDefinition, Risk } from "@/engine";

const NATURAL_RESOURCES = [
  "raw",
  "fine",
  "fused",
  "superior",
  "supreme",
  "rawAE",
] as const;

type NaturalResource = (typeof NATURAL_RESOURCES)[number];

function ensureRisk(risk: Risk | undefined, fallback: Risk): Risk {
  return risk ?? fallback;
}

const naturalActions: ActionSpec[] = [
  {
    id: "natural.T2.refine",
    name: "Refine Raw → Fine",
    tier: "T2",
    timeMinutes: 60,
    risks: {
      low: { dc: 5, timeMinutes: 30 },
      standard: { dc: 12, timeMinutes: 60 },
      high: { dc: 20, timeMinutes: 120 },
    },
    io: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return {
          consume: { raw: 3 },
          produceOnSuccess: { fine: 1 },
          salvage: { dc: 8, produce: { raw: 2 } },
        };
      }
      if (resolved === "high") {
        return {
          consume: { raw: 1 },
          produceOnSuccess: { fine: 1 },
        };
      }
      return {
        consume: { raw: 2 },
        produceOnSuccess: { fine: 1 },
        salvage: { dc: 12, produce: { raw: 1 } },
      };
    },
  },
  {
    id: "natural.T3.infuse",
    name: "Infuse Fine + RawAE → Fused",
    tier: "T3",
    timeMinutes: 30,
    risks: {
      standard: { dc: 12, timeMinutes: 30 },
    },
    io: () => ({
      consume: { fine: 2, rawAE: 2 },
      produceOnSuccess: { fused: 1 },
      salvage: { dc: 10, produce: { fine: 2 } },
    }),
  },
  {
    id: "natural.T4.refine",
    name: "Refine Fused (+RawAE) → Superior",
    tier: "T4",
    timeMinutes: 120,
    risks: {
      low: { dc: 12, timeMinutes: 60 },
      standard: { dc: 18, timeMinutes: 120 },
      high: { dc: 34, timeMinutes: 480 },
    },
    options: {
      allowExtraCatalyst: true,
      dcReduction: { perUnit: 4, minDC: 5, resource: "rawAE" },
    },
    io: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return {
          consume: { fused: 3 },
          produceOnSuccess: { superior: 1 },
          salvage: { dc: 10, produce: { fine: 5 } },
        };
      }
      if (resolved === "high") {
        return {
          consume: { fused: 1 },
          produceOnSuccess: { superior: 1 },
          salvage: { dc: 18, produce: { fine: 1 } },
        };
      }
      return {
        consume: { fused: 2 },
        produceOnSuccess: { superior: 1 },
        salvage: { dc: 14, produce: { fine: 3 } },
      };
    },
  },
  {
    id: "natural.T5.refine",
    name: "Refine Superior → Supreme",
    tier: "T5",
    timeMinutes: 120,
    risks: {
      standard: { dc: 12, timeMinutes: 60 },
      high: { dc: 18, timeMinutes: 120 },
    },
    io: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "high") {
        return {
          consume: { superior: 2 },
          produceOnSuccess: { supreme: 1 },
          salvage: { dc: 15, produce: { superior: 1 } },
        };
      }
      return {
        consume: { superior: 3 },
        produceOnSuccess: { supreme: 1 },
        salvage: { dc: 10, produce: { superior: 2 } },
      };
    },
  },
];

export const naturalFamily: FamilyDefinition = {
  id: "natural",
  name: "Natural Essence",
  resources: [...NATURAL_RESOURCES],
  resourceLabels: {
    raw: "T1 Raw",
    fine: "T2 Fine",
    fused: "T3 Fused",
    superior: "T4 Superior",
    supreme: "T5 Supreme",
    rawAE: "Raw Arcane Essence",
  },
  actions: naturalActions,
  defaults: {
    risks: ["standard"],
  },
};

export type NaturalInventory = Record<NaturalResource, number>;
