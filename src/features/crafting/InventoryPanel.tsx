import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { FamilyDefinition } from "@/engine";

interface InventoryPanelProps {
  family: FamilyDefinition;
  inventory: Record<string, number>;
  sessionMinutes: number;
  onChange: (resource: string, value: number) => void;
  onSnapshot: () => void;
  onRestore: () => void;
  onClear: () => void;
}

export function InventoryPanel({
  family,
  inventory,
  sessionMinutes,
  onChange,
  onSnapshot,
  onRestore,
  onClear,
}: InventoryPanelProps) {
  return (
    <Card className="border-slate-200/70 bg-white/90 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900">Inventory</CardTitle>
        <p className="text-sm text-slate-500">Track resources for {family.name}.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          {family.resources.map((resource) => (
            <div key={resource} className="grid gap-1.5">
              <Label className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">
                {family.resourceLabels?.[resource] ?? resource}
              </Label>
              <Input
                type="number"
                min={0}
                value={inventory[resource] ?? 0}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onChange(resource, Math.max(0, Number.isNaN(next) ? 0 : next));
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={onSnapshot}>
            Snapshot
          </Button>
          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={onRestore}>
            Restore
          </Button>
          <Button type="button" variant="ghost" className="h-8 px-3 text-xs text-rose-600" onClick={onClear}>
            Clear
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Session crafting time: <span className="font-medium text-slate-900">{sessionMinutes} minutes</span>
        </p>
      </CardContent>
    </Card>
  );
}
