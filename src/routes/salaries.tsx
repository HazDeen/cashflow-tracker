import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { AddSalarySheet, type SalaryInitial } from "@/components/AddSalarySheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Pencil, Trash2, Wallet, Archive } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { ArchiveTabs } from "@/components/ArchiveTabs";

export const Route = createFileRoute("/salaries")({ component: SalariesPage });
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Salary = { id: string; name: string; amount: number; payment_days: number[]; is_active: boolean };

function SalariesPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<SalaryInitial>(null);
  const [tab, setTab] = useState<"active" | "archive">("active");

  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const { data: salaries } = useQuery({
    queryKey: ["salaries", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("salaries").select("*").eq("user_id", userId!).order("created_at");
      if (error) throw error;
      return data as Salary[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("salaries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["salaries", userId] });
      qc.invalidateQueries({ queryKey: ["next-income", userId] });
    },
  });

  const archive = useMutation({
    mutationFn: async (s: Salary) => {
      const { error } = await (supabase as any).from("salaries").update({ is_active: !s.is_active }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["salaries", userId] });
      qc.invalidateQueries({ queryKey: ["next-income", userId] });
    },
  });

  const total = (salaries ?? []).filter(s => s.is_active).reduce((a, s) => a + Number(s.amount), 0);

  // Calendar marks: this month's payment days for all active salaries
  const paymentDates = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear(); const m = today.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const set = new Set<string>();
    (salaries ?? []).filter(s => s.is_active).forEach(s => {
      (s.payment_days || []).forEach(d => {
        const day = Math.min(d, lastDay);
        set.add(`${y}-${m}-${day}`);
      });
    });
    return Array.from(set).map(k => {
      const [yy, mm, dd] = k.split("-").map(Number);
      return new Date(yy, mm, dd);
    });
  }, [salaries]);

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Зарплата</h1>
        <Button size="icon" onClick={() => { setEdit(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-income to-[oklch(0.65_0.18_150)] text-primary-foreground p-5 shadow-lg shadow-income/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <Wallet size={14} /> В месяц
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{fmt.format(total)} ₽</p>
      </section>

      <section className="mx-5 mt-4 rounded-2xl bg-card border p-2 flex justify-center">
        <Calendar
          mode="multiple"
          selected={paymentDates}
          showOutsideDays
          className={cn("p-3 pointer-events-auto")}
        />
      </section>

      <div className="mx-5 mt-4"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 rounded-2xl bg-card border divide-y divide-border overflow-hidden">
        {(salaries ?? []).filter(s => tab === "active" ? s.is_active : !s.is_active).length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">Пусто</li>
        )}
        {(salaries ?? []).filter(s => tab === "active" ? s.is_active : !s.is_active).map(s => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-income-soft text-income shrink-0">
              <Wallet size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${!s.is_active ? "opacity-60" : ""}`}>{s.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                Дни: {(s.payment_days || []).join(", ") || "—"}
              </p>
            </div>
            <span className="font-mono tabular-nums text-sm text-income">+{fmt.format(s.amount)} ₽</span>
            <div className="flex items-center gap-1 ml-1">
              <button onClick={() => archive.mutate(s)} title={s.is_active ? "В архив" : "Восстановить"}
                className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                <Archive size={15} />
              </button>
              <button onClick={() => { setEdit({ id: s.id, name: s.name, amount: s.amount, payment_days: s.payment_days }); setOpen(true); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                <Pencil size={15} />
              </button>
              <button onClick={() => { if (window.confirm("Удалить зарплату?")) remove.mutate(s.id); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <TabBar />
      {userId && <AddSalarySheet open={open} onOpenChange={setOpen} userId={userId} initial={edit} />}
    </div>
  );
}
