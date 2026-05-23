import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { TabBar } from "@/components/TabBar";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { getCategory } from "@/lib/categories";

export const Route = createFileRoute("/stats")({
  component: StatsPage,
  head: () => ({ meta: [{ title: "Статистика — Финансы" }] }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const PIE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#3b82f6",
  "#14b8a6", "#a855f7",
];

function StatsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const { data: txs } = useQuery({
    queryKey: ["stats-tx", userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
      const { data, error } = await supabase
        .from("transactions")
        .select("type,amount,category,occurred_on")
        .eq("user_id", userId!)
        .gte("occurred_on", since.toISOString().slice(0, 10))
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: cashbackMonth } = useQuery({
    queryKey: ["stats-cashback", userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(); since.setDate(1);
      const { data } = await supabase.from("transactions")
        .select("amount").eq("user_id", userId!).eq("category", "Кэшбэк").eq("type", "income")
        .gte("occurred_on", since.toISOString().slice(0, 10));
      return (data ?? []).reduce((s, t) => s + Number(t.amount), 0);
    },
  });


  const stats = useMemo(() => {
    if (!txs) return null;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;

    const byCat: Record<string, number> = {};
    const byCatPrev: Record<string, number> = {};
    let income = 0, expense = 0, prevExpense = 0, prevIncome = 0;
    const monthMap: Record<string, { income: number; expense: number }> = {};

    for (const t of txs) {
      const amt = Number(t.amount);
      const m = String(t.occurred_on).slice(0, 7);
      monthMap[m] ??= { income: 0, expense: 0 };
      if (t.type === "income") {
        monthMap[m].income += amt;
        if (m === thisMonth) income += amt;
        if (m === prevMonth) prevIncome += amt;
      } else {
        monthMap[m].expense += amt;
        if (m === thisMonth) {
          expense += amt;
          byCat[t.category] = (byCat[t.category] ?? 0) + amt;
        }
        if (m === prevMonth) {
          prevExpense += amt;
          byCatPrev[t.category] = (byCatPrev[t.category] ?? 0) + amt;
        }
      }
    }

    const pie = Object.entries(byCat)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);

    const top5 = pie.slice(0, 5).map(p => ({
      name: p.name,
      value: p.value,
      prev: Math.round(byCatPrev[p.name] ?? 0),
      diff: p.value - Math.round(byCatPrev[p.name] ?? 0),
    }));

    const monthsList: { month: string; label: string; income: number; expense: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = monthMap[key] ?? { income: 0, expense: 0 };
      monthsList.push({
        month: key,
        label: d.toLocaleDateString("ru-RU", { month: "short" }),
        income: Math.round(v.income),
        expense: Math.round(v.expense),
        net: Math.round(v.income - v.expense),
      });
    }

    return { pie, income, expense, net: income - expense, months: monthsList, prevExpense, prevIncome, top5 };
  }, [txs]);

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-3">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold">Статистика</h1>
      </header>

      {/* KPI */}
      <section className="mx-5 grid grid-cols-3 gap-2">
        <Kpi icon={<TrendingUp size={14} />} label="Доход" value={stats ? `+${fmt.format(stats.income)} ₽` : "—"} tone="income" />
        <Kpi icon={<TrendingDown size={14} />} label="Расход" value={stats ? `−${fmt.format(stats.expense)} ₽` : "—"} tone="expense" />
        <Kpi icon={<Wallet size={14} />} label="Чистыми" value={stats ? `${stats.net >= 0 ? "+" : "−"}${fmt.format(Math.abs(stats.net))} ₽` : "—"} tone={stats && stats.net >= 0 ? "income" : "expense"} />
      </section>

      {/* Pie by category */}
      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Расходы по категориям (этот месяц)</p>
        {stats && stats.pie.length > 0 ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {stats.pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${fmt.format(Number(v))} ₽`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {stats.pie.slice(0, 8).map((p, i) => {
                const cat = getCategory(p.name);
                const Icon = cat.icon;
                const pct = stats.expense ? Math.round((p.value / stats.expense) * 100) : 0;
                return (
                  <li key={p.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <Icon size={14} className={cat.color} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                    <span className="font-mono tabular-nums">{fmt.format(p.value)} ₽</span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-8">Нет данных за этот месяц</p>
        )}
      </section>

      {/* Bars by month */}
      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Доходы и расходы (6 мес)</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.months ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `${fmt.format(Number(v))} ₽`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Доход" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" name="Расход" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Net line */}
      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Чистый доход по месяцам</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats?.months ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `${fmt.format(Number(v))} ₽`} />
              <Line type="monotone" dataKey="net" name="Чистыми" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Comparison vs prev month */}
      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Сравнение с прошлым месяцем</p>
        {stats && (
          <div className="grid grid-cols-2 gap-2">
            <CompareCell label="Доходы" cur={stats.income} prev={stats.prevIncome} positive />
            <CompareCell label="Расходы" cur={stats.expense} prev={stats.prevExpense} />
          </div>
        )}
      </section>

      {/* Top-5 categories with trend */}
      {stats && stats.top5.length > 0 && (
        <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Топ-5 категорий: динамика</p>
          <ul className="space-y-2">
            {stats.top5.map((c) => {
              const cat = getCategory(c.name);
              const Icon = cat.icon;
              const up = c.diff > 0;
              const pct = c.prev ? Math.round((c.diff / c.prev) * 100) : null;
              return (
                <li key={c.name} className="flex items-center gap-3">
                  <Icon size={16} className={cat.color} />
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  <span className="font-mono text-sm tabular-nums">{fmt.format(c.value)} ₽</span>
                  <span className={`text-xs w-14 text-right ${up ? "text-expense" : "text-income"}`}>
                    {pct === null ? "—" : `${up ? "+" : ""}${pct}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Cashback summary */}
      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4 flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-soft text-brand">💳</span>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Кэшбэк за месяц</p>
          <p className="font-mono text-lg font-semibold text-income">+{fmt.format(cashbackMonth ?? 0)} ₽</p>
        </div>
        <Link to="/cashbacks" className="text-xs text-brand font-medium">Управлять →</Link>
      </section>

      <TabBar />

    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "income" | "expense" }) {
  return (
    <div className="rounded-2xl bg-card border p-3">
      <div className={`flex items-center gap-1 ${tone === "income" ? "text-income" : "text-expense"}`}>
        {icon}<span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}

function CompareCell({ label, cur, prev, positive }: { label: string; cur: number; prev: number; positive?: boolean }) {
  const diff = cur - prev;
  const pct = prev ? Math.round((diff / prev) * 100) : null;
  // For expenses: increase is bad (red). For income: increase is good (green).
  const isGood = positive ? diff >= 0 : diff <= 0;
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold mt-0.5">{fmt.format(cur)} ₽</p>
      <p className={`text-xs mt-1 ${isGood ? "text-income" : "text-expense"}`}>
        {pct === null ? "нет данных" : `${diff >= 0 ? "+" : ""}${pct}% vs ${fmt.format(prev)}`}
      </p>
    </div>
  );
}
