import type { FamilyDefinition } from "@/engine";

// This file showcases how a non-natural family could be defined. It is **not** registered
// by default. To enable it, import `arcaneSampleFamily` in the family registry and add it
// to the registry array. The UI will create the appropriate tabs automatically.

export const arcaneSampleFamily: FamilyDefinition = {
  id: "arcane-sample",
  name: "Arcane (Sample)",
  resources: ["essenceShard", "catalystDust", "arcaneCore", "mote"],
  defaults: {
    risks: ["standard", "risky"],
  },
  actions: [
    {
      id: "arcane.sample.transmute",
      name: "Transmute Shards → Core",
      tier: "T3",
      timeMinutes: 45,
      risks: {
        standard: { dc: 14, timeMinutes: 45 },
        risky: { dc: 18, timeMinutes: 20 },
      },
      io: ({ risk, inputs }) => {
        const catalystAvailable = inputs.catalystDust ?? 0;
        const consumeCatalyst = risk === "risky" ? 1 : 2;
        return {
          consume: { essenceShard: 3, catalystDust: consumeCatalyst },
          produceOnSuccess: { arcaneCore: 1 },
          salvage: {
            dc: 13,
            produce: { mote: catalystAvailable > consumeCatalyst ? 2 : 1 },
          },
        };
      },
      options: {
        custom: {
          overflowDustConversion: true,
        },
      },
    },
    {
      id: "arcane.sample.focus",
      name: "Focus Core",
      tier: "T4",
      timeMinutes: 60,
      dc: ({ inputs }) => 10 + Math.floor((inputs.arcaneCore ?? 0) / 2),
      io: () => ({
        consume: { arcaneCore: 1 },
        produceOnSuccess: { mote: 3 },
        salvage: { dc: 15, produce: { catalystDust: 1 } },
      }),
    },
  ],
};
