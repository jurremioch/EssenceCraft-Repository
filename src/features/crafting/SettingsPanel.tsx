import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { CraftingSettings } from "@/app/store/craftingStore";

interface SettingsPanelProps {
  settings: CraftingSettings;
  onChange: (patch: Partial<CraftingSettings>) => void;
  onUpdateManualQueue: (type: "check" | "salvage", values: number[]) => void;
}

function parseManualQueue(value: string): number[] {
  return value
    .split(/[ ,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((num) => Number.isFinite(num) && num >= 1 && num <= 20);
}

export function SettingsPanel({ settings, onChange, onUpdateManualQueue }: SettingsPanelProps) {
  const [manualCheckText, setManualCheckText] = useState("");
  const [manualSalvageText, setManualSalvageText] = useState("");

  useEffect(() => {
    setManualCheckText(settings.manualCheckQueue.join(", "));
  }, [settings.manualCheckQueue]);

  useEffect(() => {
    setManualSalvageText(settings.manualSalvageQueue.join(", "));
  }, [settings.manualSalvageQueue]);

  return (
    <Card className="border-slate-200/70 bg-white/60 shadow-sm backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">Settings</CardTitle>
        <p className="text-sm text-slate-500">Control modifiers, rolling mode, and manual queues.</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Crafting modifier</Label>
          <Input
            type="number"
            value={settings.modifier}
            onChange={(event) => onChange({ modifier: Number(event.target.value) || 0 })}
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs uppercase tracking-wide text-slate-500">Check roll mode</Label>
          <Select
            value={settings.rollMode}
            onValueChange={(value) => onChange({ rollMode: value as CraftingSettings["rollMode"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="adv">Advantage</SelectItem>
              <SelectItem value="dis">Disadvantage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/70 p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Automatic rolls</p>
            <p className="text-xs text-slate-500">Toggle off to feed manual d20 results.</p>
          </div>
          <Switch
            checked={settings.rollResolution === "auto"}
            onCheckedChange={(checked) => onChange({ rollResolution: checked ? "auto" : "manual" })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/70 p-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Dice overlay</p>
            <p className="text-xs text-slate-500">Show the animated dice results after each attempt.</p>
          </div>
          <Switch
            checked={settings.showDiceOverlay}
            onCheckedChange={(checked) => onChange({ showDiceOverlay: checked })}
          />
        </div>

        {settings.rollResolution === "manual" ? (
          <div className="space-y-4 rounded-lg border border-slate-200/70 bg-white/70 p-3">
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Manual check rolls</Label>
              <Input
                value={manualCheckText}
                onChange={(event) => setManualCheckText(event.target.value)}
                onBlur={() => onUpdateManualQueue("check", parseManualQueue(manualCheckText))}
                placeholder="e.g. 5, 12, 18"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Manual salvage rolls</Label>
              <Input
                value={manualSalvageText}
                onChange={(event) => setManualSalvageText(event.target.value)}
                onBlur={() => onUpdateManualQueue("salvage", parseManualQueue(manualSalvageText))}
                placeholder="e.g. 4, 16"
              />
            </div>
            <p className="text-xs text-slate-500">Numbers should be between 1 and 20. The app consumes them in order.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
