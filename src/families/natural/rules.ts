import type { FamilyDefinition, Risk } from "@/engine";

import { createActionSpecFromTierAction, type TierAction } from "../tier-actions";

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

const naturalTierActions: TierAction[] = [
  {
    key: "T2",
    label: "Refine Raw → Fine",
    risks: {
      low: { dc: 5, timeMinutes: 30 },
      standard: { dc: 12, timeMinutes: 60 },
      high: { dc: 20, timeMinutes: 120 },
    },
    inputs: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return { raw: 3 };
      }
      if (resolved === "high") {
        return { raw: 1 };
      }
      return { raw: 2 };
    },
    salvage: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return { dc: 8, returns: () => ({ raw: 2 }) };
      }
      if (resolved === "high") {
        return null;
      }
      return { dc: 12, returns: () => ({ raw: 1 }) };
    },
    dc: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") return 5;
      if (resolved === "high") return 20;
      return 12;
    },
    timeMinutes: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") return 30;
      if (resolved === "high") return 120;
      return 60;
    },
    attempt: () => ({
      successDelta: { fine: 1 },
      failDelta: {},
    }),
  },
  {
    key: "T3",
    label: "Infuse Fine + RawAE → Fused",
    risks: {
      standard: { dc: 12, timeMinutes: 30 },
    },
    inputs: () => ({ fine: 2, rawAE: 2 }),
    salvage: () => ({ dc: 10, returns: () => ({ fine: 2 }) }),
    dc: () => 12,
    timeMinutes: () => 30,
    attempt: () => ({
      successDelta: { fused: 1 },
      failDelta: {},
    }),
  },
  {
    key: "T4",
    label: "Refine Fused (+RawAE) → Superior",
    risks: {
      low: { dc: 12, timeMinutes: 60 },
      standard: { dc: 18, timeMinutes: 120 },
      high: { dc: 34, timeMinutes: 480 },
    },
    options: {
      allowExtraCatalyst: true,
      dcReduction: { perUnit: 4, minDC: 5, resource: "rawAE" },
    },
    inputs: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return { fused: 3 };
      }
      if (resolved === "high") {
        return { fused: 1 };
      }
      return { fused: 2 };
    },
    salvage: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") {
        return { dc: 10, returns: () => ({ fine: 5 }) };
      }
      if (resolved === "high") {
        return { dc: 18, returns: () => ({ fine: 1 }) };
      }
      return { dc: 14, returns: () => ({ fine: 3 }) };
    },
    dc: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") return 12;
      if (resolved === "high") return 34;
      return 18;
    },
    timeMinutes: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "low") return 60;
      if (resolved === "high") return 480;
      return 120;
    },
    attempt: () => ({
      successDelta: { superior: 1 },
      failDelta: {},
    }),
  },
  {
    key: "T5",
    label: "Refine Superior → Supreme",
    risks: {
      standard: { dc: 12, timeMinutes: 60 },
      high: { dc: 18, timeMinutes: 120 },
    },
    inputs: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "high") {
        return { superior: 2 };
      }
      return { superior: 3 };
    },
    salvage: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "high") {
        return { dc: 15, returns: () => ({ superior: 1 }) };
      }
      return { dc: 10, returns: () => ({ superior: 2 }) };
    },
    dc: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "high") return 18;
      return 12;
    },
    timeMinutes: ({ risk }) => {
      const resolved = ensureRisk(risk, "standard");
      if (resolved === "high") return 120;
      return 60;
    },
    attempt: () => ({
      successDelta: { supreme: 1 },
      failDelta: {},
    }),
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
  actions: [
    createActionSpecFromTierAction("natural.T2.refine", naturalTierActions[0]),
    createActionSpecFromTierAction("natural.T3.infuse", naturalTierActions[1]),
    createActionSpecFromTierAction("natural.T4.refine", naturalTierActions[2]),
    createActionSpecFromTierAction("natural.T5.refine", naturalTierActions[3]),
  ],
  defaults: {
    risks: ["standard"],
  },
};

export const naturalTierCatalog = naturalTierActions;

export type NaturalInventory = Record<NaturalResource, number>;
