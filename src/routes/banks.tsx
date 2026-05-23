import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, Plus, Trash2, Landmark, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/banks")({
  component: BanksPage,
  head: () => ({ meta: [{ title: "Банки — Финансы" }] }),
});

type Bank = { id: string; name: string; color: string };

const PRESET_COLORS = ["#FFDD2D", "#FF6B35", "#EF4444", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#F59E0B", "#0EA5E9", "#64748B"];

function BanksPage() {
  const nav = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bank | null>(null);

  const { data: banks } = useQuery<Bank[]>({
    queryKey: ["banks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("banks")
        .select("id,name,color").eq("user_id", userId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("banks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banks", userId] }),
  });

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold flex-1">Банки</h1>
        <Button size="icon" onClick={() => { setEditing(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={18} />
        </Button>
      </header>

      <p className="mx-5 text-sm text-muted-foreground">
        Добавь свои банки, чтобы привязывать к ним операции и считать кэшбэк по каждому отдельно.
      </p>

      <ul className="mx-5 mt-4 space-y-2">
        {(banks ?? []).length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Пока нет банков</p>
        )}
        {banks?.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-card border p-4">
            <span className="grid place-items-center w-10 h-10 rounded-full text-white" style={{ backgroundColor: b.color }}>
              <Landmark size={18} />
            </span>
            <p className="flex-1 font-medium truncate">{b.name}</p>
            <button onClick={() => { setEditing(b); setOpen(true); }} className="p-2 text-muted-foreground hover:text-brand">
              <Pencil size={15} />
            </button>
            <button onClick={() => { if (confirm("Удалить банк?")) del.mutate(b.id); }}
              className="p-2 text-muted-foreground hover:text-destructive">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      <BankSheet open={open} onOpenChange={setOpen} userId={userId} initial={editing} />
      <TabBar />
    </div>
  );
}

function BankSheet({ open, onOpenChange, userId, initial }: {
  open: boolean; onOpenChange: (v: boolean) => void; userId?: string; initial: Bank | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setColor(initial?.color ?? PRESET_COLORS[0]);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      if (initial) {
        const { error } = await (supabase as any).from("banks").update({ name, color }).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("banks").insert({ user_id: userId, name, color });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Сохранено" : "Добавлено");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["banks", userId] });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>{initial ? "Редактировать банк" : "Новый банк"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <Input placeholder="Название (Tinkoff, Сбер, Альфа…)" value={name}
            onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" autoFocus />
          <div>
            <p className="text-xs text-muted-foreground mb-2 px-1">Цвет</p>
            <div className="grid grid-cols-10 gap-2">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`aspect-square rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <Button className="w-full h-12 rounded-xl" disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}>Сохранить</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
