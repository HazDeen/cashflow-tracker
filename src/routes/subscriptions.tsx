import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { AddSubscriptionSheet } from "@/components/AddSubscriptionSheet";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Repeat, CalendarDays, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/subscriptions")({ component: SubsPage });
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function periodLabel(unit?: string, value?: number) {
  const v = value ?? 1;
  const u = unit ?? "month";
  if (u === "week") return v === 1 ? "раз в неделю" : `раз в ${v} нед.`;
  if (u === "month") {
    if (v === 1) return "раз в месяц";
    if (v === 3) return "раз в 3 мес.";
    if (v === 6) return "раз в 6 мес.";
    if (v === 12) return "раз в год";
    return `раз в ${v} мес.`;
  }
  return "раз в месяц";
}

function SubsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: subs } = useQuery({
    queryKey: ["subscriptions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions").select("*").eq("user_id", userId!).order("charge_day");
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  if (!session) return null;
  const total = (subs ?? []).filter(s => s.is_active).reduce((a, s) => a + Number(s.amount), 0);

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Подписки</h1>
        <Button size="icon" onClick={() => setOpen(true)} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-brand to-[oklch(0.55_0.18_255)] text-primary-foreground p-5 shadow-lg shadow-brand/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <Repeat size={14} /> В месяц
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{fmt.format(total)} ₽</p>
      </section>

      <ul className="mx-5 mt-4 rounded-2xl bg-card border divide-y divide-border overflow-hidden">
        {subs?.map(s => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-soft text-brand">
              <CalendarDays size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.charge_day}-го · {periodLabel((s as any).period_unit, (s as any).period_value)}
              </p>
            </div>
            <span className="font-mono tabular-nums text-sm">{fmt.format(Number(s.amount))} ₽</span>
            <button onClick={() => remove.mutate(s.id)}
              className="ml-2 p-2 -mr-2 text-muted-foreground hover:text-destructive transition">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {(!subs || subs.length === 0) && (
          <li className="text-center text-sm text-muted-foreground py-12">Нет активных подписок</li>
        )}
      </ul>

      <TabBar />
      {userId && <AddSubscriptionSheet open={open} onOpenChange={setOpen} userId={userId} />}
    </div>
  );
}
