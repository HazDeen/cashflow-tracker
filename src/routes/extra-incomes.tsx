import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { ArchiveTabs } from "@/components/ArchiveTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Plus, TrendingUp, Trash2, Pencil, Archive } from "lucide-react";
import { haptic } from "@/lib/telegram";

export const Route = createFileRoute("/extra-incomes")({
  component: Page,
  head: () => ({ meta: [{ title: "Доп. доходы — Финансы" }] }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Extra = {
  id: string; user_id: string; name: string; amount: number; category: string;
  period_unit: string; period_value: number; next_date: string; is_active: boolean;
};

const PERIODS = [
  { unit: "week", value: 1, label: "Раз в неделю" },
  { unit: "month", value: 1, label: "Раз в месяц" },
  { unit: "month", value: 3, label: "Раз в 3 мес." },
  { unit: "month", value: 6, label: "Раз в 6 мес." },
  { unit: "year", value: 1, label: "Раз в год" },
  { unit: "once", value: 1, label: "Разово" },
];
const CATEGORIES = ["Фриланс", "Аренда", "Дивиденды", "Подработка", "Кэшбэк", "Подарок", "Другое"];

function Page() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<"active" | "archive">("active");
  const [sheet, setSheet] = useState<{ open: boolean; item: Extra | null }>({ open: false, item: null });

  const { data: items } = useQuery({
    queryKey: ["extra-incomes", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("extra_incomes").select("*").eq("user_id", userId!).order("next_date");
      if (error) throw error;
      return data as Extra[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("extra_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["extra-incomes", userId] }),
  });

  const archive = useMutation({
    mutationFn: async (it: Extra) => {
      const { error } = await (supabase as any).from("extra_incomes").update({ is_active: !it.is_active }).eq("id", it.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["extra-incomes", userId] });
      qc.invalidateQueries({ queryKey: ["next-income", userId] });
    },
  });

  if (!session) return null;
  const list = (items ?? []).filter(i => tab === "active" ? i.is_active : !i.is_active);

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-3">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Доп. доходы</h1>
        <Button size="icon" onClick={() => setSheet({ open: true, item: null })} className="rounded-full h-10 w-10"><Plus size={20} /></Button>
      </header>

      <div className="mx-5 mt-2"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 space-y-2">
        {list.map(it => {
          const periodLabel = PERIODS.find(p => p.unit === it.period_unit && p.value === it.period_value)?.label ?? `Раз в ${it.period_value} ${it.period_unit}`;
          return (
            <li key={it.id} className="rounded-2xl bg-card border p-4 flex items-center gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-full bg-income-soft text-income shrink-0"><TrendingUp size={18} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{it.name}</p>
                <p className="text-xs text-muted-foreground">
                  {it.category} · {periodLabel} · {new Date(it.next_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </p>
              </div>
              <span className="font-mono tabular-nums text-sm text-income">+{fmt.format(Number(it.amount))} ₽</span>
              <button onClick={() => archive.mutate(it)} className="p-2 text-muted-foreground hover:text-brand transition"><Archive size={16} /></button>
              <button onClick={() => setSheet({ open: true, item: it })} className="p-2 text-muted-foreground hover:text-brand transition"><Pencil size={16} /></button>
              <button onClick={() => { if (window.confirm("Удалить?")) remove.mutate(it.id); }} className="p-2 -mr-2 text-muted-foreground hover:text-destructive transition"><Trash2 size={16} /></button>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-center text-sm text-muted-foreground py-12">{tab === "active" ? "Нет активных" : "Архив пуст"}</li>}
      </ul>

      <TabBar />
      {userId && <ExtraSheet key={sheet.item?.id ?? "new"} open={sheet.open} onOpenChange={(o) => setSheet(s => ({ ...s, open: o }))} userId={userId} item={sheet.item} />}
    </div>
  );
}

function ExtraSheet({ open, onOpenChange, userId, item }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; item: Extra | null }) {
  const qc = useQueryClient();
  const isEdit = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [category, setCategory] = useState(item?.category ?? "Фриланс");
  const [periodIdx, setPeriodIdx] = useState(() => {
    if (!item) return 1;
    const idx = PERIODS.findIndex(p => p.unit === item.period_unit && p.value === item.period_value);
    return idx >= 0 ? idx : 1;
  });
  const [nextDate, setNextDate] = useState(item?.next_date ?? new Date().toISOString().slice(0, 10));

  const save = useMutation({
    mutationFn: async () => {
      const p = PERIODS[periodIdx];
      const payload: any = {
        name, amount: Number(amount), category,
        period_unit: p.unit, period_value: p.value, next_date: nextDate,
      };
      if (isEdit && item) {
        const { error } = await (supabase as any).from("extra_incomes").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("extra_incomes").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["extra-incomes", userId] });
      qc.invalidateQueries({ queryKey: ["next-income", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4"><SheetTitle>{isEdit ? "Изменить доход" : "Новый доход"}</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name && amount) save.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Название</label>
            <Input value={name} onChange={e => setName(e.target.value)} required autoFocus className="h-12 rounded-xl" placeholder="Заказ на фрилансе…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Сумма, ₽</label>
              <Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} required className="h-12 rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Категория</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="h-12 rounded-xl bg-background border w-full px-3 text-sm">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Период</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PERIODS.map((p, i) => (
                <button key={i} type="button" onClick={() => setPeriodIdx(i)}
                  className={`h-10 rounded-lg text-xs font-medium transition ${periodIdx === i ? "bg-brand text-primary-foreground" : "bg-muted"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Следующая дата</label>
            <Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} required className="h-12 rounded-xl" />
          </div>
          <Button type="submit" disabled={save.isPending} className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? "Сохраняем..." : isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
