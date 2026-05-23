import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Users, ChevronLeft, Copy, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shared")({ component: SharedPage });

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Budget = {
  id: string; name: string; emoji: string; owner_id: string;
  invite_code: string; monthly_limit: number | null;
  members_count: number; balance: number; month_expense: number; month_income: number;
};

function SharedPage() {
  const nav = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [openJoin, setOpenJoin] = useState(false);

  const { data: budgets } = useQuery<Budget[]>({
    queryKey: ["shared-budgets", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_shared_budgets");
      if (error) throw error;
      return (data ?? []) as Budget[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; emoji: string; limit: string }) => {
      const { data, error } = await (supabase as any).rpc("create_shared_budget", {
        _name: input.name, _emoji: input.emoji || "👥",
        _monthly_limit: input.limit ? Number(input.limit) : null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { toast.success("Бюджет создан"); qc.invalidateQueries({ queryKey: ["shared-budgets"] }); setOpenCreate(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await (supabase as any).rpc("join_shared_budget", { _code: code });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Вы присоединились к бюджету"); qc.invalidateQueries({ queryKey: ["shared-budgets"] }); setOpenJoin(false); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <button onClick={() => nav({ to: "/profile" })} className="p-2 -ml-2 rounded-lg hover:bg-muted">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold flex-1">Совместный бюджет</h1>
      </header>

      <div className="mx-5 grid grid-cols-2 gap-2 mb-4">
        <Button onClick={() => setOpenCreate(true)} className="rounded-xl h-11">
          <Plus size={16} /> Создать
        </Button>
        <Button onClick={() => setOpenJoin(true)} variant="outline" className="rounded-xl h-11">
          <Users size={16} /> Присоединиться
        </Button>
      </div>

      <div className="mx-5 space-y-3">
        {(budgets ?? []).map((b) => (
          <Link key={b.id} to="/shared/$id" params={{ id: b.id }}
            className="block rounded-2xl bg-card border p-4 hover:bg-muted/50 transition">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{b.emoji}</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {b.members_count} {b.members_count === 1 ? "участник" : "участников"} · код {b.invite_code}
                </p>
              </div>
              <ChevronRight className="text-muted-foreground" size={18} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Баланс</p>
                <p className="font-mono text-sm font-medium">{fmt.format(b.balance)} ₽</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Доход (мес)</p>
                <p className="font-mono text-sm text-income">+{fmt.format(b.month_income)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Расход (мес)</p>
                <p className="font-mono text-sm text-expense">−{fmt.format(b.month_expense)}</p>
              </div>
            </div>
            {b.monthly_limit && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-brand"
                    style={{ width: `${Math.min(100, (b.month_expense / b.monthly_limit) * 100)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-right">
                  {fmt.format(b.month_expense)} / {fmt.format(b.monthly_limit)} ₽
                </p>
              </div>
            )}
          </Link>
        ))}
        {(!budgets || budgets.length === 0) && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Users className="mx-auto mb-2 opacity-50" size={32} />
            <p>Нет бюджетов. Создайте свой или присоединитесь по коду.</p>
          </div>
        )}
      </div>

      <CreateSheet open={openCreate} onOpenChange={setOpenCreate}
        onSave={(v) => create.mutate(v)} pending={create.isPending} />
      <JoinSheet open={openJoin} onOpenChange={setOpenJoin}
        onSave={(c) => join.mutate(c)} pending={join.isPending} />

      <TabBar />
    </div>
  );
}

function CreateSheet({ open, onOpenChange, onSave, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSave: (v: { name: string; emoji: string; limit: string }) => void; pending: boolean;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [limit, setLimit] = useState("");
  useEffect(() => { if (open) { setName(""); setEmoji("👥"); setLimit(""); } }, [open]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left mb-4"><SheetTitle>Новый бюджет</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (name) onSave({ name, emoji, limit }); }}
          className="space-y-3">
          <div className="flex gap-2">
            <Input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
              className="h-12 w-16 rounded-xl text-center text-xl" />
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Семья / Поездка / Соседи" className="h-12 rounded-xl flex-1" autoFocus />
          </div>
          <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="decimal" placeholder="Месячный лимит расходов (опц.)" className="h-12 rounded-xl" />
          <Button type="submit" disabled={pending || !name} className="w-full h-12 rounded-xl">
            {pending ? "Создание…" : "Создать"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function JoinSheet({ open, onOpenChange, onSave, pending }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSave: (code: string) => void; pending: boolean;
}) {
  const [code, setCode] = useState("");
  useEffect(() => { if (open) setCode(""); }, [open]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left mb-4"><SheetTitle>Присоединиться</SheetTitle></SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onSave(code.trim()); }}
          className="space-y-3">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Код приглашения" className="h-12 rounded-xl text-center font-mono uppercase tracking-wider" autoFocus />
          <Button type="submit" disabled={pending || !code.trim()} className="w-full h-12 rounded-xl">
            {pending ? "Подключение…" : "Войти в бюджет"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
