import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Trash2, CreditCard, CalendarDays, Pencil, Archive, ChevronDown, Coins } from "lucide-react";
import { haptic } from "@/lib/telegram";
import type { Tables } from "@/integrations/supabase/types";
import { ArchiveTabs } from "@/components/ArchiveTabs";

export const Route = createFileRoute("/credits")({ component: CreditsPage });
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Credit = Tables<"credits">;

function calcMonths(totalPayable: number, paid: number, monthly: number) {
  if (!monthly || monthly <= 0) return 0;
  const remaining = Math.max(0, totalPayable - paid);
  return Math.ceil(remaining / monthly);
}

function CreditsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<{ open: boolean; credit: Credit | null }>({ open: false, credit: null });
  const [tab, setTab] = useState<"active" | "archive">("active");

  const { data: credits } = useQuery({
    queryKey: ["credits", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credits").select("*").eq("user_id", userId!).order("payment_day");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credits", userId] });
      qc.invalidateQueries({ queryKey: ["next-payment", userId] });
    },
  });

  const archive = useMutation({
    mutationFn: async (c: Credit) => {
      const { error } = await supabase.from("credits").update({ is_active: !c.is_active }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credits", userId] });
      qc.invalidateQueries({ queryKey: ["next-payment", userId] });
    },
  });

  if (!session) return null;
  const list = (credits ?? []).filter(c => tab === "active" ? c.is_active : !c.is_active);
  const active = (credits ?? []).filter(c => c.is_active);
  const monthlyTotal = active.reduce((a, c) => a + Number(c.monthly_payment), 0);
  const remainingTotal = active.reduce(
    (a, c) => a + Math.max(0, Number(c.total_payable) - Number(c.paid_amount ?? 0)),
    0,
  );

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Кредиты</h1>
        <Button size="icon" onClick={() => setSheet({ open: true, credit: null })} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-brand to-[oklch(0.55_0.18_255)] text-primary-foreground p-5 shadow-lg shadow-brand/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <CreditCard size={14} /> Платёж в месяц
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{fmt.format(monthlyTotal)} ₽</p>
        <p className="mt-2 text-xs text-primary-foreground/70">
          Осталось выплатить: <span className="font-mono">{fmt.format(remainingTotal)} ₽</span>
        </p>
      </section>

      <div className="mx-5 mt-4"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 space-y-2">
        {list.map(c => (
          <CreditItem
            key={c.id}
            credit={c}
            onEdit={() => setSheet({ open: true, credit: c })}
            onArchive={() => archive.mutate(c)}
            onRemove={() => { if (window.confirm("Удалить кредит?")) remove.mutate(c.id); }}
            userId={userId!}
          />
        ))}
        {list.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">
            {tab === "active" ? "Нет активных кредитов" : "Архив пуст"}
          </li>
        )}
      </ul>

      <TabBar />
      {userId && (
        <CreditSheet
          key={sheet.credit?.id ?? "new"}
          open={sheet.open}
          onOpenChange={(o) => setSheet(s => ({ ...s, open: o }))}
          userId={userId}
          credit={sheet.credit}
        />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-mono tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function CreditItem({ credit: c, onEdit, onArchive, onRemove, userId }: {
  credit: Credit; onEdit: () => void; onArchive: () => void; onRemove: () => void; userId: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");

  const paid = Number(c.paid_amount ?? 0);
  const total = Number(c.total_payable);
  const monthly = Number(c.monthly_payment);
  const monthsLeft = calcMonths(total, paid, monthly);
  const progress = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  const extraPay = useMutation({
    mutationFn: async (amt: number) => {
      const { error } = await (supabase as any).rpc("extra_credit_payment", { _credit_id: c.id, _amount: amt });
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["credits", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      qc.invalidateQueries({ queryKey: ["next-payment", userId] });
      setExtraOpen(false);
      setExtraAmount("");
    },
  });

  const schedule = useMemo(() => {
    if (monthly <= 0) return [] as Array<{ date: Date; payment: number; balance: number }>;
    const start = c.start_date ? new Date(c.start_date) : new Date();
    let remaining = total - paid;
    const out: Array<{ date: Date; payment: number; balance: number }> = [];
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    let i = 0;
    while (remaining > 0 && i < 360) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, c.payment_day);
      const pay = Math.min(monthly, remaining);
      remaining -= pay;
      if (d >= todayStart) out.push({ date: d, payment: pay, balance: Math.max(0, remaining) });
      i++;
      if (out.length >= 36) break;
    }
    return out;
  }, [c, paid, total, monthly]);

  return (
    <li className="rounded-2xl bg-card border p-4">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-soft text-brand shrink-0">
          <CreditCard size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{c.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <CalendarDays size={12} /> {c.payment_day}-го · осталось {monthsLeft} мес.
          </p>
        </div>
        {c.is_active && (
          <button onClick={() => setExtraOpen(v => !v)} title="Досрочный платёж" className="p-2 text-brand hover:bg-brand-soft rounded-lg transition">
            <Coins size={16} />
          </button>
        )}
        <button onClick={onArchive} title={c.is_active ? "В архив" : "Восстановить"} className="p-2 text-muted-foreground hover:text-brand transition">
          <Archive size={16} />
        </button>
        <button onClick={onEdit} className="p-2 text-muted-foreground hover:text-brand transition"><Pencil size={16} /></button>
        <button onClick={onRemove} className="p-2 -mr-2 text-muted-foreground hover:text-destructive transition"><Trash2 size={16} /></button>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
        <Field label="Платёж" value={`${fmt.format(monthly)} ₽`} />
        <Field label="Выплачено" value={`${fmt.format(paid)} ₽`} />
        <Field label="Всего" value={`${fmt.format(total)} ₽`} />
      </div>

      {extraOpen && c.is_active && (
        <div className="mt-3 pt-3 border-t flex gap-2">
          <Input inputMode="decimal" autoFocus value={extraAmount} onChange={e => setExtraAmount(e.target.value.replace(",", "."))}
            placeholder="Сумма доп. платежа, ₽" className="h-10 rounded-lg font-mono" />
          <Button onClick={() => Number(extraAmount) > 0 && extraPay.mutate(Number(extraAmount))} disabled={extraPay.isPending} className="h-10 rounded-lg">
            Внести
          </Button>
        </div>
      )}

      {schedule.length > 0 && (
        <button onClick={() => setOpen(v => !v)} className="mt-3 flex items-center gap-1 text-xs text-brand">
          График платежей <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && schedule.length > 0 && (
        <ul className="mt-2 max-h-60 overflow-y-auto divide-y divide-border text-xs">
          {schedule.map((s, i) => (
            <li key={i} className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{s.date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "2-digit" })}</span>
              <span className="font-mono tabular-nums">−{fmt.format(s.payment)} ₽</span>
              <span className="text-muted-foreground font-mono tabular-nums">{fmt.format(s.balance)} ₽</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function CreditSheet({
  open, onOpenChange, userId, credit,
}: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; credit: Credit | null }) {
  const qc = useQueryClient();
  const isEdit = !!credit;
  const [name, setName] = useState(credit?.name ?? "");
  const [total, setTotal] = useState(credit ? String(credit.total_payable) : "");
  const [monthly, setMonthly] = useState(credit ? String(credit.monthly_payment) : "");
  const [paid, setPaid] = useState(credit ? String(credit.paid_amount ?? 0) : "0");
  const [day, setDay] = useState(credit ? String(credit.payment_day) : "1");

  const months = useMemo(
    () => calcMonths(Number(total) || 0, Number(paid) || 0, Number(monthly) || 0),
    [total, paid, monthly],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        total_amount: Number(total),
        total_payable: Number(total),
        monthly_payment: Number(monthly),
        paid_amount: Number(paid) || 0,
        payment_day: Number(day),
        months_total: months || 1,
      };
      if (isEdit && credit) {
        const { error } = await supabase.from("credits").update(payload).eq("id", credit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("credits").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["credits", userId] });
      qc.invalidateQueries({ queryKey: ["next-payment", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{isEdit ? "Изменить кредит" : "Новый кредит"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name && total && monthly) save.mutate(); }}
          className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Название</label>
            <Input placeholder="Ипотека, авто…" value={name} onChange={e => setName(e.target.value)}
              required autoFocus className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Сумма кредита (всего к оплате), ₽</label>
            <Input inputMode="decimal" placeholder="650000" value={total} required
              onChange={e => setTotal(e.target.value.replace(",", "."))}
              className="h-12 rounded-xl font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Платёж в месяц, ₽</label>
              <Input inputMode="decimal" placeholder="15000" value={monthly} required
                onChange={e => setMonthly(e.target.value.replace(",", "."))}
                className="h-12 rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Уже выплачено, ₽</label>
              <Input inputMode="decimal" placeholder="0" value={paid}
                onChange={e => setPaid(e.target.value.replace(",", "."))}
                className="h-12 rounded-xl font-mono" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">День платежа</label>
            <Input type="number" min={1} max={31} value={day} required
              onChange={e => setDay(e.target.value)}
              className="h-12 rounded-xl font-mono" />
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Срок выплаты</span>
            <span className="font-mono tabular-nums font-medium">
              {months} мес.
            </span>
          </div>

          <Button type="submit" disabled={save.isPending}
            className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? "Сохраняем..." : isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
