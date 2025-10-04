# Natural Essence Crafting

A single-page React application for managing Natural Essence crafting runs. The UI lets you track inventory, simulate crafting attempts across tiers, preview expected outcomes, and review a full history of rolls and actions.

## Getting started

```bash
npm install
npm run dev
```

The development server runs on [http://localhost:5173](http://localhost:5173). Tailwind CSS, shadcn/ui primitives, and framer-motion are preconfigured.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create a production build. |
| `npm run test` | Run the Vitest unit test suite. |

## Feature highlights

- Inventory editor with undo/clear and local persistence (stored under `nec_app_state_v2_0`).
- Auto and manual rolling modes with advantage/disadvantage settings for the main check only.
- Tier-specific controls including risk selection, extra RawAE for T4, max feasible attempts, odds preview, and EV chips.
- Animated dice overlay for the latest single attempt plus dual-column recent roll history.
- Detailed action log, smoke test diagnostics, and session timers for flavour time tracking.
- Game rules, feasibility checks, and probability helpers covered by Vitest unit tests.

## Theming & accessibility

- Light and dark palettes are driven by CSS variables that respect the system `prefers-color-scheme` setting.
- A dark-mode toggle is available in the Settings panel to override the system preference at any time.
- Semantic Tailwind tokens (e.g. `bg-background`, `text-foreground`, `border-border`) replace fixed hex values to guarantee consistent contrast in both themes.
