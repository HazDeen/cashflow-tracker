import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Loader2, Lightbulb, AlertTriangle, Check } from "lucide-react";
import { generateInsights, type AiInsightsResult } from "@/lib/ai-insights.functions";

export const Route = createFileRoute("/ai-insights")({
  component: AiInsightsPage,
  head: () => ({ meta: [{ title: "AI рекомендации — Финансы" }] }),
});

function AiInsightsPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const fn = useServerFn(generateInsights);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiInsightsResult | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) throw new Error("Сессия не найдена, перезайдите в приложение");
      const r = await fn({ data: { accessToken: token } });
      setResult(r);
    } catch (e: any) {
      setResult({ summary: "", recommendations: [], warnings: [], error: e?.message ?? "Ошибка" });
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-3">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold">AI рекомендации</h1>
      </header>

      <section className="mx-5 rounded-3xl bg-gradient-to-br from-brand to-[oklch(0.55_0.18_255)] text-primary-foreground p-5 shadow-lg shadow-brand/20">
        <div className="flex items-center gap-2 text-primary-foreground/80 text-xs uppercase tracking-wider">
          <Sparkles size={14} /> Персональный анализ
        </div>
        <p className="mt-2 text-sm leading-relaxed text-primary-foreground/95">
          ИИ изучит ваши доходы, расходы, подписки, долги и смены за последние 90 дней и подскажет, как сэкономить.
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Что учитывается</p>
        <ul className="space-y-1.5 text-sm">
          {[
            "Текущий баланс и динамика по месяцам",
            "Все категории расходов и их доля",
            "Активные подписки и их стоимость",
            "Открытые долги (мои и мне должны)",
            "Запланированные смены и ожидаемый доход",
          ].map((s) => (
            <li key={s} className="flex items-start gap-2">
              <Check size={16} className="text-income mt-0.5 shrink-0" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-5 mt-4">
        <Button onClick={run} disabled={busy} className="w-full h-12 rounded-xl text-base">
          {busy
            ? <><Loader2 size={18} className="animate-spin" /> Анализируем…</>
            : <><Sparkles size={18} /> Дать рекомендации</>}
        </Button>
      </div>

      {result?.error && (
        <div className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm p-3">
          {result.error}
        </div>
      )}

      {result && !result.error && (
        <>
          {result.summary && (
            <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Вывод</p>
              <p className="text-sm leading-relaxed">{result.summary}</p>
            </section>
          )}

          {result.warnings.length > 0 && (
            <section className="mx-5 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Внимание
              </p>
              <ul className="space-y-2">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.recommendations.length > 0 && (
            <section className="mx-5 mt-4 rounded-2xl bg-card border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Lightbulb size={12} /> Рекомендации
              </p>
              <ul className="space-y-3">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-sm flex items-start gap-2.5">
                    <span className="grid place-items-center w-6 h-6 rounded-full bg-brand-soft text-brand text-xs font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <TabBar />
    </div>
  );
}
