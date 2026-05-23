import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";

const PERIODS = [
  { label: "Раз в неделю", unit: "week", value: 1 },
  { label: "Раз в месяц", unit: "month", value: 1 },
  { label: "Раз в 3 месяца", unit: "month", value: 3 },
  { label: "Раз в 6 месяцев", unit: "month", value: 6 },
  { label: "Раз в год", unit: "month", value: 12 },
  { label: "Свой период", unit: "custom", value: 1 },
] as const;

export function AddSubscriptionSheet({
  open, onOpenChange, userId,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [periodIdx, setPeriodIdx] = useState(1); // month/1
  const [customUnit, setCustomUnit] = useState<"week" | "month">("month");
  const [customValue, setCustomValue] = useState("2");

  const add = useMutation({
    mutationFn: async () => {
      const p = PERIODS[periodIdx];
      const period_unit = p.unit === "custom" ? customUnit : p.unit;
      const period_value = p.unit === "custom" ? Math.max(1, Number(customValue) || 1) : p.value;
      const { error } = await (supabase as any).from("subscriptions").insert({
        user_id: userId, name, amount: Number(amount), charge_day: Number(day),
        period_unit, period_value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      setName(""); setAmount(""); setDay("1"); setPeriodIdx(1);
      qc.invalidateQueries({ queryKey: ["subscriptions", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      onOpenChange(false);
    },
  });

  const period = PERIODS[periodIdx];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>Новая подписка</SheetTitle>
        </SheetHeader>

        <form onSubmit={(e) => { e.preventDefault(); if (name && amount) add.mutate(); }}
          className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Название</label>
            <Input placeholder="Netflix, Spotify…" value={name} onChange={e => setName(e.target.value)}
              required autoFocus className="h-12 rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Сумма, ₽</label>
              <Input inputMode="decimal" placeholder="299" value={amount} required
                onChange={e => setAmount(e.target.value.replace(",", "."))}
                className="h-12 rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">День списания</label>
              <Input type="number" min={1} max={31} value={day} required
                onChange={e => setDay(e.target.value)}
                className="h-12 rounded-xl font-mono" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground px-1">Периодичность</label>
            <div className="grid grid-cols-2 gap-2">
              {PERIODS.map((p, i) => (
                <button key={p.label} type="button" onClick={() => setPeriodIdx(i)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition border ${
                    periodIdx === i ? "bg-brand text-primary-foreground border-brand" : "bg-card border-border"
                  }`}>{p.label}</button>
              ))}
            </div>
            {period.unit === "custom" && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input type="number" min={1} value={customValue} onChange={e => setCustomValue(e.target.value)}
                  className="h-12 rounded-xl font-mono" placeholder="каждые N" />
                <select value={customUnit} onChange={e => setCustomUnit(e.target.value as "week" | "month")}
                  className="h-12 rounded-xl border bg-card px-3 text-sm">
                  <option value="week">недель</option>
                  <option value="month">месяцев</option>
                </select>
              </div>
            )}
          </div>

          <Button type="submit" disabled={add.isPending}
            className="w-full h-12 rounded-xl text-base mt-2">
            {add.isPending ? "Сохраняем..." : "Добавить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
