import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { TransactionSheet, type TxInitial } from "@/components/AddTransactionSheet";
import { Button } from "@/components/ui/button";
import {
  Plus, ArrowDownCircle, ArrowUpCircle, Search, Pencil, Trash2, ScanLine,
} from "lucide-react";
import { ScanReceiptDialog } from "@/components/ScanReceiptDialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { haptic } from "@/lib/telegram";

export const Route = createFileRoute("/transactions")({ component: TxPage });

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function TxPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { t } = useI18n();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<TxInitial | null>(null);
  const [q, setQ] = useState("");

  const { data: txs } = useQuery({
    queryKey: ["transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions").select("*").eq("user_id", userId!)
        .order("occurred_on", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

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

  const filtered = useMemo(() => {
    const list = txs ?? [];
    if (!q.trim()) return list;
    const term = q.toLowerCase();
    return list.filter(x =>
      x.category?.toLowerCase().includes(term) || x.comment?.toLowerCase().includes(term),
    );
  }, [txs, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const tx of filtered) {
      const arr = map.get(tx.occurred_on) ?? [];
      arr.push(tx);
      map.set(tx.occurred_on, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!session) return null;

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (tx: typeof filtered[number]) => {
    setEditing({
      id: tx.id,
      type: tx.type as "income" | "expense",
      amount: Number(tx.amount),
      category: tx.category,
      comment: tx.comment,
      occurred_on: tx.occurred_on,
      bank_id: (tx as any).bank_id ?? null,
    });
    setOpen(true);
  };
  const handleDelete = (id: string) => {
    if (window.confirm(t("confirmDelete"))) remove.mutate(id);
  };

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("operations")}</h1>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setScanOpen(true)}
            className="rounded-full h-10 w-10" title="Сканировать чек">
            <ScanLine size={18} />
          </Button>
          <Button size="icon" onClick={openCreate} className="rounded-full h-10 w-10">
            <Plus size={20} />
          </Button>
        </div>
      </header>

      <div className="mx-5 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t("search")}
          className="h-11 pl-9 rounded-xl bg-card" />
      </div>

      <div className="mx-5 mt-4 space-y-5">
        {grouped.map(([date, items]) => (
          <div key={date}>
            <p className="text-xs text-muted-foreground mb-2 px-1">{date}</p>
            <ul className="rounded-2xl bg-card border divide-y divide-border overflow-hidden">
              {items.map(tx => (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`grid place-items-center w-9 h-9 rounded-full ${
                    tx.type === "income" ? "bg-income-soft text-income" : "bg-expense-soft text-expense"
                  }`}>
                    {tx.type === "income" ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.category}</p>
                    {tx.comment && <p className="text-xs text-muted-foreground truncate">{tx.comment}</p>}
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
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">{t("empty")}</p>
        )}
      </div>

      <TabBar />
      {userId && (
        <>
          <TransactionSheet open={open} onOpenChange={setOpen} userId={userId} initial={editing} />
          <ScanReceiptDialog userId={userId} open={scanOpen} onOpenChange={setScanOpen} />
        </>
      )}
    </div>
  );
}
