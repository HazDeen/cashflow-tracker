import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { TabBar } from "@/components/TabBar";
import { ArrowLeft, ChevronLeft, ChevronRight, Repeat, CreditCard, Wallet, Briefcase, TrendingUp, AlarmClock, HandCoins } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
  head: () => ({ meta: [{ title: "Финансовый календарь" }] }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const KIND_META: Record<string, { icon: any; color: string; label: string }> = {
  subscription: { icon: Repeat, color: "text-purple-500", label: "Подписка" },
  credit: { icon: CreditCard, color: "text-orange-500", label: "Кредит" },
  salary: { icon: Wallet, color: "text-emerald-500", label: "Зарплата" },
  shift: { icon: Briefcase, color: "text-emerald-500", label: "Смена" },
  extra: { icon: TrendingUp, color: "text-emerald-500", label: "Доп. доход" },
  reminder: { icon: AlarmClock, color: "text-blue-500", label: "Напоминание" },
  debt: { icon: HandCoins, color: "text-amber-500", label: "Долг" },
};
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function CalendarPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState<string>(new Date().toISOString().slice(0, 10));

  const { from, to } = useMemo(() => {
    const f = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const t = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
  }, [cursor]);

  const { data: events } = useQuery({
    queryKey: ["calendar", userId, from, to],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_calendar_events", { _from: from, _to: to });
      if (error) throw error;
      return data as { d: string; kind: string; title: string; amount: number; direction: string }[];
    },
  });

  const byDay = useMemo(() => {
    const m: Record<string, typeof events> = {};
    for (const e of events ?? []) (m[e.d] ??= [] as any).push(e);
    return m;
  }, [events]);

  // Build calendar grid (Mon start)
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= lastDay; d++) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date: dt.toISOString().slice(0, 10), day: d });
    }
    while (cells.length % 7) cells.push({ date: null, day: null });
    return cells;
  }, [cursor]);

  if (!session) return null;

  const monthLabel = cursor.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const todayStr = new Date().toISOString().slice(0, 10);
  const dayEvents = byDay[selected] ?? [];

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-3">
        <Link to="/" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold flex-1">Календарь</h1>
      </header>

      <section className="mx-5 rounded-2xl bg-card border p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronLeft size={18} /></button>
          <p className="font-medium capitalize">{monthLabel}</p>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-muted"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(w => <div key={w} className="text-[10px] text-center text-muted-foreground uppercase tracking-wider py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((c, i) => {
            if (!c.date) return <div key={i} />;
            const evs = byDay[c.date] ?? [];
            const hasIncome = evs.some(e => e.direction === "income");
            const hasExpense = evs.some(e => e.direction === "expense");
            const hasNeutral = evs.some(e => e.direction === "neutral");
            const isSelected = c.date === selected;
            const isToday = c.date === todayStr;
            return (
              <button key={i} onClick={() => setSelected(c.date!)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition ${
                  isSelected ? "bg-brand text-primary-foreground" : isToday ? "bg-brand-soft text-brand font-semibold" : "hover:bg-muted"
                }`}>
                <span>{c.day}</span>
                {(hasIncome || hasExpense || hasNeutral) && (
                  <div className="absolute bottom-1 flex gap-0.5">
                    {hasIncome && <span className="w-1 h-1 rounded-full bg-emerald-500" />}
                    {hasExpense && <span className="w-1 h-1 rounded-full bg-rose-500" />}
                    {hasNeutral && <span className="w-1 h-1 rounded-full bg-blue-500" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-5 mt-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
          {new Date(selected).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        {dayEvents.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8 rounded-2xl bg-card border">Нет событий</p>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e, i) => {
              const meta = KIND_META[e.kind] ?? { icon: AlarmClock, color: "text-muted-foreground", label: e.kind };
              const Icon = meta.icon;
              return (
                <li key={i} className="rounded-2xl bg-card border p-3 flex items-center gap-3">
                  <span className={`grid place-items-center w-10 h-10 rounded-full bg-muted ${meta.color}`}>
                    <Icon size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{meta.label}</p>
                  </div>
                  {Number(e.amount) > 0 && (
                    <span className={`font-mono text-sm font-semibold ${e.direction === "income" ? "text-income" : "text-expense"}`}>
                      {e.direction === "income" ? "+" : "−"}{fmt.format(Number(e.amount))} ₽
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <TabBar />
    </div>
  );
}
