import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";

export type SalaryInitial = {
  id?: string;
  name?: string;
  amount?: number;
  payment_days?: number[];
} | null;

export function AddSalarySheet({
  open, onOpenChange, userId, initial,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; initial?: SalaryInitial }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setAmount(initial?.amount ? String(initial.amount) : "");
      setDays(initial?.payment_days ?? []);
    }
  }, [open, initial]);

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, name, amount: Number(amount), payment_days: days };
      if (initial?.id) {
        const { error } = await (supabase as any).from("salaries").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("salaries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["salaries", userId] });
      qc.invalidateQueries({ queryKey: ["next-income", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0 max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{initial?.id ? "Изменить зарплату" : "Новая зарплата"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name && amount && days.length) save.mutate(); }}
          className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Название</label>
            <Input placeholder="Основная работа, аванс…" value={name} required
              onChange={e => setName(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Сумма, ₽</label>
            <Input inputMode="decimal" placeholder="50000" value={amount} required
              onChange={e => setAmount(e.target.value.replace(",", "."))}
              className="h-12 rounded-xl font-mono" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground px-1">Дни прихода (можно несколько)</label>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                const active = days.includes(d);
                return (
                  <button key={d} type="button" onClick={() => toggleDay(d)}
                    className={`h-9 rounded-lg text-xs font-medium transition ${
                      active ? "bg-brand text-primary-foreground" : "bg-muted text-foreground"
                    }`}>{d}</button>
                );
              })}
            </div>
          </div>
          <Button type="submit" disabled={save.isPending || !days.length}
            className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? "Сохраняем..." : "Сохранить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
