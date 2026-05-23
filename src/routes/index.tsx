import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { initTelegram, tgUser } from "@/lib/telegram";
import { daysLeftInMonth } from "@/lib/finance";
import { TabBar } from "@/components/TabBar";
import { TransactionSheet, type TxInitial } from "@/components/AddTransactionSheet";
import { AddSubscriptionSheet } from "@/components/AddSubscriptionSheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { haptic } from "@/lib/telegram";
import {
  Plus, Repeat, TrendingUp, CalendarClock, Wallet, ChevronRight, Pencil, Trash2,
  CreditCard, HandCoins, AlarmClock, Shield, LineChart as LineChartIcon,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Финансы — Главная" },
      { name: "description", content: "Личный трекер финансов в Telegram." },
    ],
  }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function Dashboard() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [txOpen, setTxOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [editing, setEditing] = useState<TxInitial | null>(null);
  const { t } = useI18n();
  const qc = useQueryClient();

  useEffect(() => { initTelegram(); }, []);
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const userId = session?.user.id;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", userId],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (error) throw error;
      const row = data?.[0] as any;
      return {
        balance: Number(row?.balance ?? 0),
        pending: Number(row?.pending_subs ?? 0),
        expectedIncome: Number(row?.expected_income ?? 0),
        myDebts: Number(row?.my_debts ?? 0),
        dailyLimit: Number(row?.daily_limit ?? 0),
        weeklyLimit: Number(row?.weekly_limit ?? 0),
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["transactions-recent", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions").select("*")
        .eq("user_id", userId!).order("occurred_on", { ascending: false }).limit(3);
      if (error) throw error;
      return data;
    },
  });

  const { data: nextPayment } = useQuery({
    queryKey: ["next-payment", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_next_payment");
      if (error) throw error;
      return (data?.[0] as { kind: string; title: string; amount: number; due_on: string } | undefined) ?? null;
    },
  });

  const { data: nextIncome } = useQuery({
    queryKey: ["next-income", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_next_income");
      if (error) throw error;
      return (data?.[0] as { kind: string; title: string; amount: number; due_on: string } | undefined) ?? null;
    },
  });

  const { data: pendingConfirmations, refetch: refetchConfirmations } = useQuery({
    queryKey: ["pending-confirmations", userId],
    enabled: !!userId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: pcs } = await (supabase as any)
        .from("payment_confirmations")
        .select("id, kind, ref_id, due_on")
        .eq("user_id", userId!).eq("status", "pending").lte("due_on", today);
      const list = (pcs ?? []) as Array<{ id: string; kind: string; ref_id: string; due_on: string }>;
      if (list.length === 0) return [];
      const creditIds = list.filter(x => x.kind === "credit").map(x => x.ref_id);
      const debtIds = list.filter(x => x.kind === "debt").map(x => x.ref_id);
      const [{ data: credits }, { data: debts }] = await Promise.all([
        creditIds.length
          ? supabase.from("credits").select("id, name, monthly_payment").in("id", creditIds)
          : Promise.resolve({ data: [] as any[] }),
        debtIds.length
          ? supabase.from("debts").select("id, counterparty, amount").in("id", debtIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return list.map(pc => {
        if (pc.kind === "credit") {
          const c = (credits ?? []).find((x: any) => x.id === pc.ref_id);
          return { id: pc.id, kind: "credit", title: c?.name ?? "Кредит", amount: Number(c?.monthly_payment ?? 0), due_on: pc.due_on };
        }
        const d = (debts ?? []).find((x: any) => x.id === pc.ref_id);
        return { id: pc.id, kind: "debt", title: d?.counterparty ?? "Долг", amount: Number(d?.amount ?? 0), due_on: pc.due_on };
      });
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("display_name, greeting_emoji, emergency_months").eq("id", userId!).maybeSingle();
      return data as { display_name: string | null; greeting_emoji: string | null; emergency_months: number | null } | null;
    },
  });

  const { data: forecast } = useQuery({
    queryKey: ["forecast", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_balance_forecast", { _days: 30 });
      if (error) throw error;
      return (data ?? []) as Array<{ d: string; balance: number; delta: number }>;
    },
  });

  const { data: avgExpense } = useQuery({
    queryKey: ["avg-expense-90", userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 90);
      const { data, error } = await supabase.from("transactions").select("amount,occurred_on")
        .eq("user_id", userId!).eq("type", "expense").gte("occurred_on", since.toISOString().slice(0, 10));
      if (error) throw error;
      const total = (data ?? []).reduce((a, t) => a + Number(t.amount), 0);
      return total / 3; // среднее за месяц
    },
  });

  const resolveConfirmation = useMutation({
    mutationFn: async ({ id, confirmed }: { id: string; confirmed: boolean }) => {
      const { error } = await (supabase as any).rpc("resolve_payment_confirmation", {
        _confirmation_id: id, _confirmed: confirmed,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("light");
      refetchConfirmations();
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
    },
  });


  const metrics = useMemo(() => {
    if (!data) return null;
    return { ...data, days: daysLeftInMonth() };
  }, [data]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["transactions", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  if (loading || !session) return null;

  const tg = tgUser();
  const fallback = tg?.first_name ?? session.user.email?.split("@")[0] ?? "друг";
  const name = profile?.display_name || fallback;
  const emoji = profile?.greeting_emoji || "👋";
  const initial = name.slice(0, 1).toUpperCase();

  const openCreate = () => { setEditing(null); setTxOpen(true); };
  const openEdit = (tx: NonNullable<typeof recent>[number]) => {
    setEditing({
      id: tx.id,
      type: tx.type as "income" | "expense",
      amount: Number(tx.amount),
      category: tx.category,
      comment: tx.comment,
      occurred_on: tx.occurred_on,
    });
    setTxOpen(true);
  };
  const handleDelete = (id: string) => {
    if (window.confirm(t("confirmDelete"))) remove.mutate(id);
  };

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="px-5 pt-7 pb-5 flex items-center gap-3">
        <Avatar className="h-12 w-12 ring-2 ring-brand-soft">
          {tg?.photo_url && <AvatarImage src={tg.photo_url} alt={name} />}
          <AvatarFallback className="bg-brand text-primary-foreground font-medium">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{t("welcomeBack")}</p>
          <h1 className="text-lg font-semibold truncate">{t("hi")}, {name} {emoji}</h1>
        </div>
      </header>

      {/* Balance card */}
      <section className="mx-5 rounded-3xl bg-gradient-to-br from-brand to-[oklch(0.55_0.18_255)] text-primary-foreground p-6 shadow-lg shadow-brand/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <Wallet size={14} /> {t("balance")}
        </div>
        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums">
          {isLoading || !metrics ? "—" : `${fmt.format(metrics.balance)} ₽`}
        </p>
        <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wider">{t("dailyLimit")}</p>
            <p className="mt-1 font-mono text-lg font-medium tabular-nums">
              {metrics ? `${fmt.format(Math.max(0, Math.floor(metrics.dailyLimit)))} ₽` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wider">{t("weeklyLimit")}</p>
            <p className="mt-1 font-mono text-lg font-medium tabular-nums">
              {metrics ? `${fmt.format(Math.max(0, Math.floor(metrics.weeklyLimit)))} ₽` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-primary-foreground/70 uppercase tracking-wider">{t("daysLeft")}</p>
            <p className="mt-1 font-mono text-lg font-medium tabular-nums">{metrics?.days ?? "—"}</p>
          </div>
        </div>
      </section>

      {/* Pending payment confirmations */}
      {pendingConfirmations && pendingConfirmations.length > 0 && (
        <section className="mx-5 mt-4 space-y-2">
          {pendingConfirmations.map((pc) => (
            <div key={pc.id} className="rounded-2xl border border-brand/40 bg-brand-soft/40 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-brand">
                {pc.kind === "credit" ? <CreditCard size={14} /> : <HandCoins size={14} />}
                Подтверди оплату
              </div>
              <p className="mt-1 text-sm">
                {pc.kind === "credit" ? "Кредит" : "Долг"}: <b>{pc.title}</b> — {fmt.format(pc.amount)} ₽
              </p>
              <p className="text-xs text-muted-foreground">Прошла ли оплата?</p>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={resolveConfirmation.isPending}
                  onClick={() => resolveConfirmation.mutate({ id: pc.id, confirmed: true })}
                  className="flex-1 rounded-xl bg-income text-white text-sm font-medium py-2 active:scale-[0.98] transition disabled:opacity-50">
                  ✅ Да
                </button>
                <button
                  disabled={resolveConfirmation.isPending}
                  onClick={() => resolveConfirmation.mutate({ id: pc.id, confirmed: false })}
                  className="flex-1 rounded-xl bg-muted text-foreground text-sm font-medium py-2 active:scale-[0.98] transition disabled:opacity-50">
                  ❌ Нет
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Nearest payment & income */}
      {(nextPayment || nextIncome) && (
        <section className="mx-5 mt-4 grid grid-cols-1 gap-3">
          {nextPayment && <NearestCard kind="payment" data={nextPayment} />}
          {nextIncome && <NearestCard kind="income" data={nextIncome} />}
        </section>
      )}

      {/* Quick actions */}
      <section className="mx-5 mt-4 grid grid-cols-2 gap-3">
        <button onClick={openCreate}
          className="flex items-center gap-3 rounded-2xl bg-card border p-4 text-left active:scale-[0.98] transition">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-soft text-brand">
            <Plus size={20} />
          </span>
          <div>
            <p className="text-sm font-medium">{t("operation")}</p>
            <p className="text-xs text-muted-foreground">{t("incomeExpense")}</p>
          </div>
        </button>
        <button onClick={() => setSubOpen(true)}
          className="flex items-center gap-3 rounded-2xl bg-card border p-4 text-left active:scale-[0.98] transition">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-soft text-brand">
            <Repeat size={20} />
          </span>
          <div>
            <p className="text-sm font-medium">{t("subscription")}</p>
            <p className="text-xs text-muted-foreground">{t("monthly")}</p>
          </div>
        </button>
      </section>

      {/* Forecast 30d */}
      {forecast && forecast.length > 0 && (
        <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <LineChartIcon size={12} /> Прогноз баланса (30 дн.)
            </p>
            <p className="text-sm font-mono tabular-nums font-semibold">
              {fmt.format(Math.round(Number(forecast[forecast.length - 1].balance)))} ₽
            </p>
          </div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.map(f => ({ ...f, balance: Number(f.balance) }))}>
                <XAxis dataKey="d" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  formatter={(v: any) => `${fmt.format(Math.round(Number(v)))} ₽`}
                  labelFormatter={(l) => new Date(l).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Emergency fund */}
      {avgExpense !== undefined && avgExpense > 0 && metrics && (
        <Link to="/profile" className="block mx-5 mt-3 rounded-2xl bg-card border p-4 active:scale-[0.99] transition">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Shield size={12} /> Подушка безопасности
            </p>
            <p className="text-xs text-muted-foreground">
              {(metrics.balance / avgExpense).toFixed(1)} / {profile?.emergency_months ?? 6} мес.
            </p>
          </div>
          {(() => {
            const months = profile?.emergency_months ?? 6;
            const target = avgExpense * months;
            const pct = Math.min(100, (metrics.balance / target) * 100);
            return (
              <>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(0, pct)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Цель: {fmt.format(Math.round(target))} ₽ (средние траты × {months})
                </p>
              </>
            );
          })()}
        </Link>
      )}

      {/* Stats */}
      <section className="mx-5 mt-3 grid grid-cols-2 gap-3">
        <Stat
          icon={<CalendarClock size={16} />}
          label={t("pendingSubs")}
          value={metrics ? `${fmt.format(metrics.pending)} ₽` : "—"}
        />
        <Stat
          icon={<TrendingUp size={16} />}
          label={t("expectedIncome")}
          value={metrics ? `+${fmt.format(metrics.expectedIncome)} ₽` : "—"}
        />
      </section>

      {/* Recent */}
      <section className="mx-5 mt-6">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold">{t("recent")}</h2>
          <button onClick={() => navigate({ to: "/transactions" })}
            className="text-xs text-brand inline-flex items-center">
            {t("all")} <ChevronRight size={14} />
          </button>
        </div>
        <ul className="rounded-2xl bg-card border divide-y divide-border overflow-hidden">
          {(recent ?? []).map(tx => (
            <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid place-items-center w-9 h-9 rounded-full ${
                tx.type === "income" ? "bg-income-soft text-income" : "bg-expense-soft text-expense"
              }`}>
                {tx.type === "income" ? <TrendingUp size={16} /> : <Wallet size={16} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.category}</p>
                <p className="text-xs text-muted-foreground">{tx.occurred_on}</p>
              </div>
              <span className={`font-mono tabular-nums text-sm ${tx.type === "income" ? "text-income" : "text-expense"}`}>
                {tx.type === "income" ? "+" : "−"}{fmt.format(Number(tx.amount))} ₽
              </span>
              <div className="flex items-center gap-1 ml-1">
                <button onClick={() => openEdit(tx)} aria-label={t("edit")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                  <Pencil size={15} />
                </button>
                <button onClick={() => handleDelete(tx.id)} aria-label={t("delete")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
          {(!recent || recent.length === 0) && (
            <li className="text-center text-sm text-muted-foreground py-8">{t("empty")}</li>
          )}
        </ul>
      </section>

      <TabBar />
      {userId && <TransactionSheet open={txOpen} onOpenChange={setTxOpen} userId={userId} initial={editing} />}
      {userId && <AddSubscriptionSheet open={subOpen} onOpenChange={setSubOpen} userId={userId} />}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <p className="text-[11px] uppercase tracking-wider leading-tight">{label}</p>
      </div>
      <p className="mt-2 font-mono text-lg font-medium tabular-nums">{value}</p>
    </div>
  );
}

function NearestCard({ kind, data }: {
  kind: "payment" | "income";
  data: { kind: string; title: string; amount: number; due_on: string };
}) {
  const date = new Date(data.due_on);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dateLabel = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const when = days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} дн.`;

  const isIncome = kind === "income";
  const icon = isIncome ? <TrendingUp size={20} />
    : data.kind === "credit" ? <CreditCard size={18} />
    : data.kind === "debt" ? <HandCoins size={18} />
    : <Repeat size={18} />;
  const kindLabel = isIncome
    ? (data.kind === "salary" ? "Зарплата" : "Смена")
    : (data.kind === "credit" ? "Кредит" : data.kind === "debt" ? "Долг" : "Подписка");
  const headerLabel = isIncome ? "Ближайший доход" : "Ближайший платёж";
  const sign = isIncome ? "+" : "";
  const amountClass = isIncome ? "text-income" : "";
  const iconWrap = isIncome ? "bg-income-soft text-income" : "bg-brand-soft text-brand";

  return (
    <div className="rounded-2xl bg-card border p-4 flex items-center gap-3">
      <span className={`grid place-items-center w-11 h-11 rounded-full shrink-0 ${iconWrap}`}>
        {isIncome ? icon : <AlarmClock size={20} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{headerLabel}</p>
        <p className="text-sm font-medium truncate flex items-center gap-1.5 mt-0.5">
          {!isIncome && <span className="text-muted-foreground">{icon}</span>}
          {kindLabel}: {data.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{dateLabel} · {when}</p>
      </div>
      <span className={`font-mono tabular-nums text-base font-semibold ${amountClass}`}>
        {sign}{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(data.amount))} ₽
      </span>
    </div>
  );
}
