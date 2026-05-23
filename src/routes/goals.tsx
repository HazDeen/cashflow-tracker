import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { ArchiveTabs } from "@/components/ArchiveTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Plus, Target, Trash2, Pencil, Archive, Coins } from "lucide-react";
import { haptic } from "@/lib/telegram";

export const Route = createFileRoute("/goals")({
  component: GoalsPage,
  head: () => ({ meta: [{ title: "Цели — Финансы" }] }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Goal = {
  id: string; user_id: string; name: string; emoji: string;
  target_amount: number; current_amount: number; deadline: string | null;
  is_archived: boolean; created_at: string;
};

const EMOJIS = ["🎯", "🏖️", "🏠", "🚗", "💍", "🎓", "💻", "📱", "✈️", "🎁", "💰", "🛡️"];

function GoalsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;
  const qc = useQueryClient();

  const [tab, setTab] = useState<"active" | "archive">("active");
  const [sheet, setSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: false, goal: null });
  const [contributeFor, setContributeFor] = useState<Goal | null>(null);

  const { data: goals } = useQuery({
    queryKey: ["goals", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("savings_goals").select("*").eq("user_id", userId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Goal[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("savings_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", userId] }),
  });

  const archive = useMutation({
    mutationFn: async (g: Goal) => {
      const { error } = await (supabase as any).from("savings_goals").update({ is_archived: !g.is_archived }).eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", userId] }),
  });

  if (!session) return null;
  const list = (goals ?? []).filter(g => tab === "active" ? !g.is_archived : g.is_archived);

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-3">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Цели и копилки</h1>
        <Button size="icon" onClick={() => setSheet({ open: true, goal: null })} className="rounded-full h-10 w-10"><Plus size={20} /></Button>
      </header>

      <div className="mx-5 mt-2"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 space-y-2">
        {list.map(g => {
          const cur = Number(g.current_amount);
          const tgt = Number(g.target_amount);
          const pct = tgt > 0 ? Math.min(100, (cur / tgt) * 100) : 0;
          return (
            <li key={g.id} className="rounded-2xl bg-card border p-4">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-soft text-2xl shrink-0">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt.format(cur)} / {fmt.format(tgt)} ₽ · {pct.toFixed(0)}%
                    {g.deadline && ` · до ${new Date(g.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`}
                  </p>
                </div>
                <button onClick={() => setContributeFor(g)} title="Пополнить" className="p-2 text-brand hover:bg-brand-soft rounded-lg transition"><Coins size={16} /></button>
                <button onClick={() => archive.mutate(g)} title={g.is_archived ? "Восстановить" : "В архив"} className="p-2 text-muted-foreground hover:text-brand transition"><Archive size={16} /></button>
                <button onClick={() => setSheet({ open: true, goal: g })} className="p-2 text-muted-foreground hover:text-brand transition"><Pencil size={16} /></button>
                <button onClick={() => { if (window.confirm("Удалить цель?")) remove.mutate(g.id); }} className="p-2 -mr-2 text-muted-foreground hover:text-destructive transition"><Trash2 size={16} /></button>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">
            {tab === "active" ? "Нет активных целей" : "Архив пуст"}
          </li>
        )}
      </ul>

      <TabBar />
      {userId && (
        <GoalSheet
          key={sheet.goal?.id ?? "new"}
          open={sheet.open}
          onOpenChange={(o) => setSheet(s => ({ ...s, open: o }))}
          userId={userId}
          goal={sheet.goal}
        />
      )}
      {contributeFor && userId && (
        <ContributeSheet goal={contributeFor} onClose={() => setContributeFor(null)} userId={userId} />
      )}
    </div>
  );
}

function GoalSheet({ open, onOpenChange, userId, goal }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; goal: Goal | null }) {
  const qc = useQueryClient();
  const isEdit = !!goal;
  const [name, setName] = useState(goal?.name ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "🎯");
  const [target, setTarget] = useState(goal ? String(goal.target_amount) : "");
  const [current, setCurrent] = useState(goal ? String(goal.current_amount) : "0");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name, emoji,
        target_amount: Number(target),
        current_amount: Number(current) || 0,
        deadline: deadline || null,
      };
      if (isEdit && goal) {
        const { error } = await (supabase as any).from("savings_goals").update(payload).eq("id", goal.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("savings_goals").insert({ ...payload, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["goals", userId] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4"><SheetTitle>{isEdit ? "Изменить цель" : "Новая цель"}</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name && target) save.mutate(); }} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Название</label>
            <Input value={name} onChange={e => setName(e.target.value)} required autoFocus className="h-12 rounded-xl" placeholder="Отпуск, ноутбук…" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Эмодзи</label>
            <div className="grid grid-cols-6 gap-1.5">
              {EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  className={`h-10 rounded-lg text-xl transition ${emoji === e ? "bg-brand-soft ring-2 ring-brand" : "bg-muted"}`}>{e}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Цель, ₽</label>
              <Input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value.replace(",", "."))} required className="h-12 rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground px-1">Уже накоплено, ₽</label>
              <Input inputMode="decimal" value={current} onChange={e => setCurrent(e.target.value.replace(",", "."))} className="h-12 rounded-xl font-mono" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Дедлайн (необязательно)</label>
            <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <Button type="submit" disabled={save.isPending} className="w-full h-12 rounded-xl text-base mt-2">
            {save.isPending ? "Сохраняем..." : isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContributeSheet({ goal, userId, onClose }: { goal: Goal; userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const contribute = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("contribute_to_goal", { _goal_id: goal.id, _amount: Number(amount) });
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("medium");
      qc.invalidateQueries({ queryKey: ["goals", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
      qc.invalidateQueries({ queryKey: ["transactions-recent", userId] });
      onClose();
    },
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0">
        <SheetHeader className="text-left mb-4"><SheetTitle>Пополнить «{goal.name}»</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (Number(amount) > 0) contribute.mutate(); }} className="space-y-3">
          <Input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value.replace(",", "."))} placeholder="Сумма, ₽" className="h-12 rounded-xl font-mono text-lg" />
          <p className="text-xs text-muted-foreground px-1">Будет создана трата в категории «Копилка».</p>
          <Button type="submit" disabled={contribute.isPending} className="w-full h-12 rounded-xl">Пополнить</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
