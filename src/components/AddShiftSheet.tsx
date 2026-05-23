import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";
import { useI18n } from "@/lib/i18n";

export type ShiftInitial = {
  id?: string;
  shift_date?: string;
  amount?: number;
  note?: string | null;
} | null;

export function AddShiftSheet({
  open, onOpenChange, userId, initial,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string; initial?: ShiftInitial;
}) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setDate(initial?.shift_date ?? new Date().toISOString().slice(0, 10));
      setAmount(initial?.amount ? String(initial.amount) : "");
      setNote(initial?.note ?? "");
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId,
        shift_date: date,
        amount: Number(amount),
        note: note || null,
      };
      if (initial?.id) {
        const { error } = await (supabase as any).from("work_shifts").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("work_shifts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["shifts", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{t("newShift")}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (date && amount) save.mutate(); }}
          className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">{t("shiftDate")}</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)}
              required className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">{t("expectedAmount")}, ₽</label>
            <Input inputMode="decimal" placeholder="5000" value={amount} required
              onChange={e => setAmount(e.target.value.replace(",", "."))}
              className="h-12 rounded-xl font-mono" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">{t("noteOpt")}</label>
            <Input value={note} onChange={e => setNote(e.target.value)}
              className="h-12 rounded-xl" />
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
