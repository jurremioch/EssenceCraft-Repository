# Essence Crafting

A modern Vite + React + TypeScript application for managing Essence crafting runs. The UI is driven by a modular rules engine so new essence families can be added by configuration instead of UI rewrites.

## Quick start

```bash
npm install
npm run dev
```

The dev server runs at [http://localhost:5173](http://localhost:5173).

### Build & preview

```bash
npm run build
npm run preview
```

### Tests

```bash
npm test
```

Vitest covers the core math helpers and the Natural family simulation flows.

## Architecture overview

- **Engine (`src/engine`)** – Pure TypeScript helpers for probability math, feasibility checks, and batch simulation. The engine exposes a small API (`simulateBatch`, `previewAction`, etc.) that works without any React context.
- **Families (`src/families`)** – Configuration modules that express each essence family as `FamilyDefinition` data. Natural Essence is registered by default. A sample Arcane family demonstrates alternative risk sets, computed DCs, and custom options.
- **UI (`src/features/crafting`)** – Family-agnostic components that read from the registry and render tier tabs, action panels, inventory, settings, and history. State lives in a persisted Zustand store under `src/app/store`.
- **Components (`src/components`)** – Shared UI primitives (shadcn/ui), layout helpers, and the framer-motion dice overlay.
- **Styles (`src/styles`)** – Tailwind base styles and theme tokens.

The project ships with ESLint + Prettier defaults, Zustand with localStorage persistence, Tailwind CSS, shadcn/ui, lucide-react icons, and framer-motion animations.

## Progressive Web App

PWA support is enabled via [`vite-plugin-pwa`](https://github.com/vite-pwa/vite-plugin-pwa). The build generates a service worker and installs a manifest (`vite.svg` is used for the icon placeholders). Run `npm run build` followed by `npm run preview` and open the preview URL to install the app.

## Adding a new essence family

1. Copy `src/families/_examples/arcane.sample.ts` into `src/families/<your-family>/rules.ts`.
2. Define the `resources`, `resourceLabels`, and `actions` for your family. Actions can use fixed DCs, risk tables, or computed DC functions.
3. Register the family in `src/families/index.ts` (add it to the array passed to `createRegistry`).
4. Start the dev server. The UI automatically creates tabs, panels, and previews for the registered family.

The generic UI reads only from the registry and the engine, so future families with unique rulesets can plug in without touching React components.
