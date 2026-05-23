import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { AddShiftSheet, type ShiftInitial } from "@/components/AddShiftSheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, Plus, Pencil, Trash2, Check } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ArchiveTabs } from "@/components/ArchiveTabs";

export const Route = createFileRoute("/shifts")({ component: ShiftsPage });
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function ShiftsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ShiftInitial>(null);
  const [tab, setTab] = useState<"active" | "archive">("active");

  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const { data: shifts } = useQuery({
    queryKey: ["shifts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("work_shifts").select("*").eq("user_id", userId!).order("shift_date");
      if (error) throw error;
      return data as Array<{ id: string; shift_date: string; amount: number; note: string | null; paid: boolean }>;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("work_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["shifts", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (s: { id: string; amount: number; shift_date: string; note: string | null }) => {
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId!, type: "income", amount: s.amount,
        category: "Работа", comment: s.note ?? "Смена", occurred_on: s.shift_date,
      });
      if (txErr) throw txErr;
      const { error } = await (supabase as any).from("work_shifts").update({ paid: true }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["shifts", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const list = useMemo(
    () => (shifts ?? []).filter(s => tab === "active" ? !s.paid : s.paid),
    [shifts, tab],
  );
  const totalUpcoming = list.filter(s => !s.paid && s.shift_date >= today).reduce((a, s) => a + Number(s.amount), 0);

  const shiftDates = useMemo(
    () => (shifts ?? []).filter(s => !s.paid).map(s => new Date(s.shift_date + "T00:00:00")),
    [shifts],
  );
  const paidDates = useMemo(
    () => (shifts ?? []).filter(s => s.paid).map(s => new Date(s.shift_date + "T00:00:00")),
    [shifts],
  );

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">{t("shifts")}</h1>
        <Button size="icon" onClick={() => { setEdit(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-income to-[oklch(0.65_0.18_150)] text-primary-foreground p-5 shadow-lg shadow-income/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <CalendarDays size={14} /> {t("expectedAmount")}
        </div>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{fmt.format(totalUpcoming)} ₽</p>
      </section>

      <section className="mx-5 mt-4 rounded-2xl bg-card border p-2 flex justify-center">
        <Calendar
          mode="multiple"
          selected={shiftDates}
          modifiers={{ paid: paidDates }}
          modifiersClassNames={{ paid: "line-through opacity-60" }}
          showOutsideDays
          className={cn("p-3 pointer-events-auto")}
        />
      </section>

      <div className="mx-5 mt-4"><ArchiveTabs value={tab} onChange={setTab} archiveLabel="Выплаченные" /></div>

      <ul className="mx-5 mt-4 rounded-2xl bg-card border divide-y divide-border overflow-hidden">
        {list.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">{t("noShifts")}</li>
        )}
        {list.map(s => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-income-soft text-income">
              <CalendarDays size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${s.paid ? "line-through opacity-60" : ""}`}>
                {new Date(s.shift_date).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US",
                  { day: "numeric", month: "short", weekday: "short" })}
              </p>
              {s.note && <p className="text-xs text-muted-foreground truncate">{s.note}</p>}
            </div>
            <span className="font-mono tabular-nums text-sm text-income">+{fmt.format(s.amount)} ₽</span>
            <div className="flex items-center gap-1 ml-1">
              {!s.paid && (
                <button onClick={() => { if (window.confirm(t("markPaidConfirm"))) markPaid.mutate(s); }}
                  aria-label={t("markPaid")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-income hover:bg-income-soft transition">
                  <Check size={15} />
                </button>
              )}
              <button onClick={() => {
                setEdit({ id: s.id, shift_date: s.shift_date, amount: s.amount, note: s.note });
                setOpen(true);
              }} className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                <Pencil size={15} />
              </button>
              <button onClick={() => { if (window.confirm(t("confirmDelete"))) remove.mutate(s.id); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <TabBar />
      {userId && <AddShiftSheet open={open} onOpenChange={setOpen} userId={userId} initial={edit} />}
    </div>
  );
}
