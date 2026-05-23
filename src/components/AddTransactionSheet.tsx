import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";
import { useI18n } from "@/lib/i18n";
import { ArrowDownCircle, ArrowUpCircle, CalendarIcon, Landmark } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { categoriesFor, getCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

export type TxInitial = {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  comment: string | null;
  occurred_on: string;
  bank_id?: string | null;
};

export function TransactionSheet({
  open, onOpenChange, userId, initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  initial?: TxInitial | null;
}) {
  const { t } = useI18n();
  const isEdit = !!initial;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0 max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{isEdit ? t("editOperation") : t("newOperation")}</SheetTitle>
        </SheetHeader>
        <ManualForm userId={userId} initial={initial} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

export const AddTransactionSheet = TransactionSheet;

/* ============== Manual ============== */

function ManualForm({
  userId, initial, onDone,
}: { userId: string; initial?: TxInitial | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const isEdit = !!initial;

  const [type, setType] = useState<"income" | "expense">(initial?.type ?? "expense");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [category, setCategory] = useState<string>(
    initial?.category ?? categoriesFor("expense")[0].name
  );

  // Авто-переключение категории, если выбран тип, в котором её нет.
  useEffect(() => {
    const list = categoriesFor(type);
    if (!list.find((c) => c.name === category)) setCategory(list[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const catList = categoriesFor(type);
  const current = getCategory(category);
  const CurrentIcon = current.icon;
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [date, setDate] = useState(initial?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [bankId, setBankId] = useState<string>(initial?.bank_id ?? "");

  const { data: banks } = useQuery({
    queryKey: ["banks", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("banks")
        .select("id,name,color").eq("user_id", userId).order("created_at");
      return (data ?? []) as { id: string; name: string; color: string }[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        type, amount: Number(amount), category, comment: comment || null, occurred_on: date,
        bank_id: bankId || null,
      };
      if (isEdit && initial) {
        const { error } = await (supabase as any).from("transactions").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("transactions").insert({ user_id: userId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["transactions", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      qc.invalidateQueries({ queryKey: ["cashback-calc", userId] });
      onDone();
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (amount) save.mutate(); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
        <button type="button" onClick={() => setType("expense")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
            type === "expense" ? "bg-card shadow-sm text-expense" : "text-muted-foreground"
          }`}>
          <ArrowUpCircle size={18} /> {t("expense")}
        </button>
        <button type="button" onClick={() => setType("income")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
            type === "income" ? "bg-card shadow-sm text-income" : "text-muted-foreground"
          }`}>
          <ArrowDownCircle size={18} /> {t("income")}
        </button>
      </div>

      <div className="rounded-2xl bg-card border p-5">
        <p className="text-xs text-muted-foreground mb-1">{t("amount")}</p>
        <div className="flex items-baseline gap-2">
          <input
            inputMode="decimal" required placeholder="0" value={amount} autoFocus
            onChange={e => setAmount(e.target.value.replace(",", "."))}
            className="flex-1 bg-transparent border-0 outline-none font-mono text-4xl tabular-nums"
          />
          <span className="text-2xl text-muted-foreground">₽</span>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2 px-1">{t("category")}</p>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-12 rounded-xl">
            <SelectValue>
              <span className="inline-flex items-center gap-2">
                <CurrentIcon size={18} className={current.color} />
                {current.name}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {catList.map(({ name, icon: Icon, color }) => (
              <SelectItem key={name} value={name}>
                <span className="inline-flex items-center gap-2">
                  <Icon size={16} className={color} />
                  {name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(banks ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2 px-1">Банк (необязательно)</p>
          <Select value={bankId || "__none"} onValueChange={(v) => setBankId(v === "__none" ? "" : v)}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue>
                {bankId ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: banks?.find(b => b.id === bankId)?.color }} />
                    {banks?.find(b => b.id === bankId)?.name}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Landmark size={16} /> Без банка
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none"><span className="text-muted-foreground">Без банка</span></SelectItem>
              {banks!.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                    {b.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline"
              className={cn("h-12 w-full rounded-xl justify-start font-normal", !date && "text-muted-foreground")}>
              <CalendarIcon size={16} />
              {date ? new Date(date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "Выбрать дату"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" side="top" sideOffset={4} collisionPadding={16}>
            <Calendar mode="single" selected={date ? new Date(date) : undefined}
              onSelect={(d) => d && setDate(d.toISOString().slice(0, 10))}
              initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Textarea placeholder={t("comment")} value={comment} onChange={e => setComment(e.target.value)}
          className="rounded-xl min-h-[60px]" />
      </div>

      <Button type="submit" disabled={save.isPending || !amount} className="w-full h-12 rounded-xl text-base">
        {save.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

