import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { AddDebtSheet, type DebtInitial } from "@/components/AddDebtSheet";
import { Button } from "@/components/ui/button";
import { HandCoins, Plus, Pencil, Trash2, Check } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { useI18n } from "@/lib/i18n";
import { ArchiveTabs } from "@/components/ArchiveTabs";

export const Route = createFileRoute("/debts")({ component: DebtsPage });
const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function DebtsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<DebtInitial>(null);
  const [tab, setTab] = useState<"active" | "archive">("active");

  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const { data: debts } = useQuery({
    queryKey: ["debts", userId, tab],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("debts").select("*").eq("user_id", userId!).eq("is_settled", tab === "archive");
      if (error) throw error;
      return data as Array<{
        id: string; direction: "i_owe" | "owed_to_me";
        counterparty: string; amount: number; due_date: string | null;
      }>;
    },
  });

  const sorted = useMemo(() => {
    return [...(debts ?? [])].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }, [debts]);

  const settle = useMutation({
    mutationFn: async (d: { id: string; direction: "i_owe" | "owed_to_me"; amount: number; counterparty: string }) => {
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId!,
        type: d.direction === "i_owe" ? "expense" : "income",
        amount: d.amount, category: "Долги", comment: d.counterparty,
        occurred_on: new Date().toISOString().slice(0, 10),
      });
      if (txErr) throw txErr;
      const { error } = await (supabase as any).from("debts").update({ is_settled: true }).eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["debts", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["debts", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  if (!session) return null;
  const today = new Date().toISOString().slice(0, 10);
  const totalOwe = sorted.filter(d => d.direction === "i_owe").reduce((a, d) => a + Number(d.amount), 0);
  const totalOwed = sorted.filter(d => d.direction === "owed_to_me").reduce((a, d) => a + Number(d.amount), 0);

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("debts")}</h1>
        <Button size="icon" onClick={() => { setEdit(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <section className="mx-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-expense-soft p-4">
          <p className="text-xs text-expense uppercase tracking-wider">{t("iOwe")}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-expense tabular-nums">{fmt.format(totalOwe)} ₽</p>
        </div>
        <div className="rounded-2xl bg-income-soft p-4">
          <p className="text-xs text-income uppercase tracking-wider">{t("owedToMe")}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-income tabular-nums">{fmt.format(totalOwed)} ₽</p>
        </div>
      </section>

      <div className="mx-5 mt-4"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 rounded-2xl bg-card border divide-y divide-border overflow-hidden">
        {sorted.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">{t("noDebts")}</li>
        )}
        {sorted.map(d => {
          const overdue = d.due_date && d.due_date < today;
          const isOwe = d.direction === "i_owe";
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid place-items-center w-9 h-9 rounded-full ${
                isOwe ? "bg-expense-soft text-expense" : "bg-income-soft text-income"
              }`}>
                <HandCoins size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t(isOwe ? "iOwe" : "owedToMe")} · {d.counterparty}
                </p>
                <p className={`text-xs truncate ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                  {d.due_date
                    ? `${overdue ? `${t("overdue")} · ` : ""}${new Date(d.due_date).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")}`
                    : t("noDueDate")}
                </p>
              </div>
              <span className={`font-mono tabular-nums text-sm ${isOwe ? "text-expense" : "text-income"}`}>
                {isOwe ? "−" : "+"}{fmt.format(d.amount)} ₽
              </span>
              <div className="flex items-center gap-1 ml-1">
                <button onClick={() => { if (window.confirm(t("settleConfirm"))) settle.mutate(d); }}
                  aria-label={t("settle")}
                  className="p-2 rounded-lg text-muted-foreground hover:text-income hover:bg-income-soft transition">
                  <Check size={15} />
                </button>
                <button onClick={() => {
                  setEdit({ id: d.id, direction: d.direction, counterparty: d.counterparty, amount: d.amount, due_date: d.due_date });
                  setOpen(true);
                }} className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                  <Pencil size={15} />
                </button>
                <button onClick={() => { if (window.confirm(t("confirmDelete"))) remove.mutate(d.id); }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <TabBar />
      {userId && <AddDebtSheet open={open} onOpenChange={setOpen} userId={userId} initial={edit} />}
    </div>
  );
}
