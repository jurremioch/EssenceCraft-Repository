import { useState } from "react";

import { NaturalEssenceCraftingApp } from "@/components/NaturalEssenceCraftingApp";

export default function App() {
  const [compactMode, setCompactMode] = useState(true);

  return (
    <div data-compact={compactMode} className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto p-6 compact-pad">
        <NaturalEssenceCraftingApp
          compactMode={compactMode}
          onToggleCompactMode={(value) => setCompactMode(value)}
        />
      </div>
    </div>
  );
}
