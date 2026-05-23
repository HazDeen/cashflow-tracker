import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus, ChevronLeft, Copy, ArrowDownCircle, ArrowUpCircle, Trash2, LogOut, Trash,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shared_/$id")({ component: SharedDetailPage });

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function SharedDetailPage() {
  const nav = useNavigate();
  const { id } = Route.useParams();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: budget } = useQuery({
    queryKey: ["shared-budget", id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_budgets" as any)
        .select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["shared-members", id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_budget_members" as any)
        .select("*").eq("budget_id", id);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: txs } = useQuery({
    queryKey: ["shared-tx", id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("shared_transactions" as any)
        .select("*").eq("budget_id", id).order("occurred_on", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const removeTx = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from("shared_transactions" as any).delete().eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-tx", id] }),
  });

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shared_budget_members" as any)
        .delete().eq("budget_id", id).eq("user_id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Вы покинули бюджет"); nav({ to: "/shared" }); },
  });

  const removeBudget = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shared_budgets" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Бюджет удалён"); nav({ to: "/shared" }); },
  });

  if (!session || !budget) return null;
  const isOwner = budget.owner_id === session.user.id;
  const balance = (txs ?? []).reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);

  const copyCode = () => {
    navigator.clipboard.writeText(budget.invite_code);
    toast.success("Код скопирован");
  };

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <button onClick={() => nav({ to: "/shared" })} className="p-2 -ml-2 rounded-lg hover:bg-muted">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-semibold flex-1 truncate">
          {budget.emoji} {budget.name}
        </h1>
        <Button size="icon" onClick={() => setOpen(true)} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <div className="mx-5 rounded-2xl bg-card border p-5 mb-4">
        <p className="text-xs text-muted-foreground">Общий баланс</p>
        <p className="text-3xl font-mono font-semibold mt-1">
          {fmt.format(balance)} ₽
        </p>
        <button onClick={copyCode}
          className="mt-3 inline-flex items-center gap-2 text-sm text-brand">
          <Copy size={14} /> Код приглашения: <span className="font-mono">{budget.invite_code}</span>
        </button>
      </div>

      <div className="mx-5 mb-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Участники ({members?.length ?? 0})
        </p>
        <div className="rounded-2xl bg-card border divide-y divide-border">
          {(members ?? []).map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-brand" />
              <span className="flex-1 truncate font-mono text-xs">{m.user_id.slice(0, 8)}…</span>
              {m.role === "owner" && <span className="text-xs text-muted-foreground">владелец</span>}
              {m.user_id === session.user.id && <span className="text-xs text-brand">это вы</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Операции
        </p>
        <ul className="rounded-2xl bg-card border divide-y divide-border overflow-hidden">
          {(txs ?? []).map((tx) => (
            <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`grid place-items-center w-9 h-9 rounded-full ${
                tx.type === "income" ? "bg-income-soft text-income" : "bg-expense-soft text-expense"
              }`}>
                {tx.type === "income" ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tx.category}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {tx.occurred_on}{tx.comment ? ` · ${tx.comment}` : ""}
                </p>
              </div>
              <span className={`font-mono tabular-nums text-sm ${
                tx.type === "income" ? "text-income" : "text-expense"
              }`}>
                {tx.type === "income" ? "+" : "−"}{fmt.format(Number(tx.amount))} ₽
              </span>
              {(tx.added_by === session.user.id || isOwner) && (
                <button onClick={() => { if (confirm("Удалить?")) removeTx.mutate(tx.id); }}
                  className="p-2 text-muted-foreground hover:text-destructive">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {(!txs || txs.length === 0) && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">Пока пусто</li>
          )}
        </ul>
      </div>

      <div className="mx-5 mt-6">
        {isOwner ? (
          <Button variant="outline" className="w-full text-destructive"
            onClick={() => { if (confirm("Удалить бюджет и все его операции?")) removeBudget.mutate(); }}>
            <Trash size={16} /> Удалить бюджет
          </Button>
        ) : (
          <Button variant="outline" className="w-full"
            onClick={() => { if (confirm("Покинуть бюджет?")) leave.mutate(); }}>
            <LogOut size={16} /> Покинуть бюджет
          </Button>
        )}
      </div>

      <AddTxSheet open={open} onOpenChange={setOpen} budgetId={id} userId={session.user.id} />
      <TabBar />
    </div>
  );
}

function AddTxSheet({ open, onOpenChange, budgetId, userId }: {
  open: boolean; onOpenChange: (v: boolean) => void; budgetId: string; userId: string;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Прочее");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) { setType("expense"); setAmount(""); setCategory("Прочее"); setComment(""); setDate(new Date().toISOString().slice(0, 10)); }
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shared_transactions" as any).insert({
        budget_id: budgetId, added_by: userId, type, amount: Number(amount),
        category, comment: comment || null, occurred_on: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-tx", budgetId] });
      qc.invalidateQueries({ queryKey: ["shared-budgets"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left mb-4"><SheetTitle>Новая операция</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (amount) save.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
            <button type="button" onClick={() => setType("expense")}
              className={`py-2.5 rounded-lg text-sm font-medium ${
                type === "expense" ? "bg-card text-expense shadow-sm" : "text-muted-foreground"
              }`}>Расход</button>
            <button type="button" onClick={() => setType("income")}
              className={`py-2.5 rounded-lg text-sm font-medium ${
                type === "income" ? "bg-card text-income shadow-sm" : "text-muted-foreground"
              }`}>Доход</button>
          </div>
          <Input inputMode="decimal" placeholder="Сумма" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value.replace(",", "."))} className="h-12 rounded-xl" />
          <Input placeholder="Категория" value={category}
            onChange={(e) => setCategory(e.target.value)} className="h-12 rounded-xl" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl" />
          <Textarea placeholder="Комментарий" value={comment}
            onChange={(e) => setComment(e.target.value)} className="rounded-xl min-h-[60px]" />
          <Button type="submit" disabled={save.isPending || !amount} className="w-full h-12 rounded-xl">
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
