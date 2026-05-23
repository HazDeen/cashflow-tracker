import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Flame, Trophy, ChevronLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/achievements")({ component: AchievementsPage });

type Gamification = {
  current_streak: number;
  longest_streak: number;
  total_days: number;
  achievements: { code: string; title: string; description: string; icon: string; unlocked_at: string }[];
};

const ALL_BADGES: { code: string; title: string; description: string; icon: string }[] = [
  { code: "first_step", title: "Первый шаг", description: "Записать первую операцию", icon: "🚀" },
  { code: "tx_50", title: "Бухгалтер", description: "50 операций", icon: "📒" },
  { code: "tx_200", title: "Финансовый гуру", description: "200 операций", icon: "🧮" },
  { code: "streak_7", title: "Неделя подряд", description: "7 дней подряд", icon: "🔥" },
  { code: "streak_30", title: "Месяц дисциплины", description: "30 дней подряд", icon: "💎" },
  { code: "goal_done", title: "Цель достигнута", description: "Закрыть первую цель", icon: "🎯" },
  { code: "debt_free", title: "Долг закрыт", description: "Закрыть первый долг", icon: "✅" },
  { code: "saver_100k", title: "Накопитель", description: "Накопить 100 000 ₽", icon: "🏦" },
  { code: "balance_500k", title: "Капиталист", description: "Баланс 500 000 ₽", icon: "💰" },
];

function AchievementsPage() {
  const nav = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const qc = useQueryClient();

  const { data } = useQuery<Gamification>({
    queryKey: ["gamification", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_user_gamification");
      if (error) throw error;
      return data as Gamification;
    },
  });

  const evalAch = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("evaluate_achievements");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Прогресс пересчитан");
      qc.invalidateQueries({ queryKey: ["gamification"] });
    },
  });

  if (!session) return null;
  const unlocked = new Set((data?.achievements ?? []).map(a => a.code));

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <button onClick={() => nav({ to: "/profile" })} className="p-2 -ml-2 rounded-lg hover:bg-muted">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-semibold flex-1">Достижения</h1>
        <Button size="sm" variant="outline" onClick={() => evalAch.mutate()} disabled={evalAch.isPending}>
          <Sparkles size={14} /> Обновить
        </Button>
      </header>

      <div className="mx-5 grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-card border p-4 text-center">
          <Flame className="mx-auto text-orange-500" size={22} />
          <p className="text-2xl font-semibold mt-1">{data?.current_streak ?? 0}</p>
          <p className="text-xs text-muted-foreground">Сейчас</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <Trophy className="mx-auto text-amber-500" size={22} />
          <p className="text-2xl font-semibold mt-1">{data?.longest_streak ?? 0}</p>
          <p className="text-xs text-muted-foreground">Рекорд</p>
        </div>
        <div className="rounded-2xl bg-card border p-4 text-center">
          <p className="text-2xl">📅</p>
          <p className="text-2xl font-semibold mt-1">{data?.total_days ?? 0}</p>
          <p className="text-xs text-muted-foreground">Активных дней</p>
        </div>
      </div>

      <div className="mx-5">
        <p className="text-sm text-muted-foreground mb-2">
          Открыто {unlocked.size} из {ALL_BADGES.length}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {ALL_BADGES.map(b => {
            const isUnlocked = unlocked.has(b.code);
            return (
              <div key={b.code}
                className={`rounded-2xl border p-4 ${
                  isUnlocked ? "bg-card" : "bg-muted/30 opacity-50"
                }`}>
                <div className="text-3xl mb-1">{b.icon}</div>
                <p className="text-sm font-medium">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <TabBar />
    </div>
  );
}
