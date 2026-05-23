import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";
import { useI18n } from "@/lib/i18n";

export type DebtInitial = {
  id?: string;
  direction?: "i_owe" | "owed_to_me";
  counterparty?: string;
  amount?: number;
  due_date?: string | null;
} | null;

export function AddDebtSheet({
  open, onOpenChange, userId, initial,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string; initial?: DebtInitial;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (open) {
      setDirection(initial?.direction ?? "i_owe");
      setCounterparty(initial?.counterparty ?? "");
      setAmount(initial?.amount ? String(initial.amount) : "");
      setDueDate(initial?.due_date ?? "");
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId,
        direction,
        counterparty,
        amount: Number(amount),
        due_date: dueDate || null,
      };
      if (initial?.id) {
        const { error } = await (supabase as any).from("debts").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("debts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["debts", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{t("newDebt")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (counterparty && amount) save.mutate(); }}
          className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["i_owe", "owed_to_me"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setDirection(v)}
                className={`h-12 rounded-xl border text-sm font-medium transition ${
                  direction === v
                    ? v === "i_owe"
                      ? "bg-expense-soft text-expense border-expense/30"
                      : "bg-income-soft text-income border-income/30"
                    : "bg-card text-muted-foreground"
                }`}>
                {t(v === "i_owe" ? "iOwe" : "owedToMe")}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">{t("counterparty")}</label>
            <Input value={counterparty} onChange={e => setCounterparty(e.target.value)}
              required autoFocus className="h-12 rounded-xl" placeholder="Иван" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">{t("amount")}, ₽</label>
              <Input inputMode="decimal" placeholder="1000" value={amount} required
                onChange={e => setAmount(e.target.value.replace(",", "."))}
                className="h-12 rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">{t("dueDate")}</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="h-12 rounded-xl" />
            </div>
          </div>
          <Button type="submit" disabled={save.isPending}
            className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
