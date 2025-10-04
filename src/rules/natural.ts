import type { EssenceFamily } from "@/rules/types";

export const naturalEssenceFamily: EssenceFamily = {
  key: "natural",
  label: "Natural essence crafting",
  description: "Track inventory, roll checks, and keep your refinement pipeline humming.",
  minDc: 5,
  resources: [
    { key: "raw", label: "T1 Raw" },
    { key: "fine", label: "T2 Fine" },
    { key: "fused", label: "T3 Fused" },
    { key: "superior", label: "T4 Superior" },
    { key: "supreme", label: "T5 Supreme" },
    { key: "rawAE", label: "Raw Arcane Essence" },
  ],
  riskProfiles: [
    { key: "low", label: "Low" },
    { key: "standard", label: "Standard" },
    { key: "high", label: "High" },
  ],
  tiers: [
    {
      key: "T2",
      label: "Tier 2 · Fine Essence",
      subtitle: "Refine Raw → Fine",
      gradient: "from-emerald-400 to-emerald-600",
      success: { fine: 1 },
      risks: [
        {
          risk: "low",
          dc: 5,
          costs: { raw: 3 },
          timeMinutes: 30,
          salvage: { dc: 8, returns: { raw: 2 } },
        },
        {
          risk: "standard",
          dc: 12,
          costs: { raw: 2 },
          timeMinutes: 60,
          salvage: { dc: 12, returns: { raw: 1 } },
        },
        {
          risk: "high",
          dc: 20,
          costs: { raw: 1 },
          timeMinutes: 120,
        },
      ],
    },
    {
      key: "T3",
      label: "Tier 3 · Fused Essence",
      subtitle: "Infuse Fine + RawAE → Fused",
      gradient: "from-sky-400 to-sky-600",
      success: { fused: 1 },
      risks: [
        {
          risk: "standard",
          dc: 12,
          costs: { fine: 2, rawAE: 2 },
          timeMinutes: 30,
          salvage: { dc: 10, returns: { fine: 2 } },
        },
      ],
    },
    {
      key: "T4",
      label: "Tier 4 · Superior Essence",
      subtitle: "Refine Fused (+RawAE) → Superior",
      gradient: "from-violet-400 to-violet-600",
      success: { superior: 1 },
      dcReduction: {
        resource: "rawAE",
        perUnit: 4,
        minDc: 5,
      },
      risks: [
        {
          risk: "low",
          dc: 12,
          costs: { fused: 3 },
          timeMinutes: 60,
          salvage: { dc: 10, returns: { fine: 5 } },
        },
        {
          risk: "standard",
          dc: 18,
          costs: { fused: 2 },
          timeMinutes: 120,
          salvage: { dc: 14, returns: { fine: 3 } },
        },
        {
          risk: "high",
          dc: 34,
          costs: { fused: 1 },
          timeMinutes: 480,
          salvage: { dc: 18, returns: { fine: 1 } },
        },
      ],
    },
    {
      key: "T5",
      label: "Tier 5 · Supreme Essence",
      subtitle: "Refine Superior → Supreme",
      gradient: "from-amber-400 to-amber-600",
      success: { supreme: 1 },
      risks: [
        {
          risk: "standard",
          dc: 12,
          costs: { superior: 3 },
          timeMinutes: 60,
          salvage: { dc: 10, returns: { superior: 2 } },
        },
        {
          risk: "high",
          dc: 18,
          costs: { superior: 2 },
          timeMinutes: 120,
          salvage: { dc: 15, returns: { superior: 1 } },
        },
      ],
    },
  ],
};
