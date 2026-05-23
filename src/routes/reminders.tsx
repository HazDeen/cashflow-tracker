import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { AddReminderSheet, type ReminderInitial } from "@/components/AddReminderSheet";
import { Button } from "@/components/ui/button";
import { AlarmClock, Plus, Pencil, Trash2, Check } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { ArchiveTabs } from "@/components/ArchiveTabs";

export const Route = createFileRoute("/reminders")({ component: RemindersPage });

type Reminder = { id: string; title: string; note: string | null; remind_on: string; is_done: boolean };

function RemindersPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ReminderInitial>(null);
  const [tab, setTab] = useState<"active" | "archive">("active");

  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);
  const userId = session?.user.id;

  const { data: reminders } = useQuery({
    queryKey: ["reminders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reminders").select("*").eq("user_id", userId!).order("remind_on");
      if (error) throw error;
      return data as Reminder[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (r: Reminder) => {
      const { error } = await (supabase as any).from("reminders").update({ is_done: !r.is_done }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { haptic("medium"); qc.invalidateQueries({ queryKey: ["reminders", userId] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { haptic("medium"); qc.invalidateQueries({ queryKey: ["reminders", userId] }); },
  });

  const list = useMemo(
    () => (reminders ?? []).filter(r => tab === "active" ? !r.is_done : r.is_done),
    [reminders, tab],
  );

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-semibold flex-1">Напоминания</h1>
        <Button size="icon" onClick={() => { setEdit(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={20} />
        </Button>
      </header>

      <div className="mx-5"><ArchiveTabs value={tab} onChange={setTab} /></div>

      <ul className="mx-5 mt-4 rounded-2xl bg-card border divide-y divide-border overflow-hidden">
        {list.length === 0 && (
          <li className="text-center text-sm text-muted-foreground py-12">Пусто</li>
        )}
        {list.map(r => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-soft text-brand shrink-0">
              <AlarmClock size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${r.is_done ? "line-through opacity-60" : ""}`}>{r.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {new Date(r.remind_on).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-1">
              <button onClick={() => toggle.mutate(r)}
                className="p-2 rounded-lg text-muted-foreground hover:text-income hover:bg-income-soft transition">
                <Check size={15} />
              </button>
              <button onClick={() => { setEdit({ id: r.id, title: r.title, note: r.note, remind_on: r.remind_on }); setOpen(true); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
                <Pencil size={15} />
              </button>
              <button onClick={() => { if (window.confirm("Удалить?")) remove.mutate(r.id); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition">
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <TabBar />
      {userId && <AddReminderSheet open={open} onOpenChange={setOpen} userId={userId} initial={edit} />}
    </div>
  );
}
