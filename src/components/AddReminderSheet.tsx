import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";

export type ReminderInitial = {
  id?: string;
  title?: string;
  note?: string | null;
  remind_on?: string;
} | null;

export function AddReminderSheet({
  open, onOpenChange, userId, initial,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; initial?: ReminderInitial }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setNote(initial?.note ?? "");
      setDate(initial?.remind_on ?? new Date().toISOString().slice(0, 10));
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, title, note: note || null, remind_on: date };
      if (initial?.id) {
        const { error } = await (supabase as any).from("reminders").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("reminders").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["reminders", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{initial?.id ? "Изменить напоминание" : "Новое напоминание"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (title && date) save.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Что напомнить</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required autoFocus
              placeholder="Оплатить интернет, день рождения…" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Дата</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} required className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Заметка (необязательно)</label>
            <Input value={note} onChange={e => setNote(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            🔔 Уведомление в Telegram придёт за день до этой даты.
          </p>
          <Button type="submit" disabled={save.isPending} className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? "Сохраняем..." : "Сохранить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
