import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type AiInsightsResult = {
  summary: string;
  recommendations: string[];
  warnings: string[];
  error: string | null;
};

const inputSchema = z.object({ accessToken: z.string().min(10) });

export const generateInsights = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<AiInsightsResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!apiKey) return { summary: "", recommendations: [], warnings: [], error: "AI gateway не настроен" };
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return { summary: "", recommendations: [], warnings: [], error: "Supabase не настроен" };
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error: authErr } = await supabase.auth.getClaims(data.accessToken);
    if (authErr || !claims?.claims?.sub) {
      return { summary: "", recommendations: [], warnings: [], error: "Сессия истекла, перезайдите в приложение" };
    }
    const userId = claims.claims.sub;

    const since = new Date(); since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().slice(0, 10);

    const [{ data: txs }, { data: subs }, { data: debts }, { data: shifts }] = await Promise.all([
      supabase.from("transactions").select("type,amount,category,occurred_on")
        .eq("user_id", userId).gte("occurred_on", sinceStr).order("occurred_on", { ascending: false }).limit(500),
      supabase.from("subscriptions").select("name,amount,charge_day,is_active").eq("user_id", userId),
      supabase.from("debts").select("counterparty,amount,direction,due_date,is_settled").eq("user_id", userId),
      (supabase as any).from("work_shifts").select("shift_date,amount,paid").eq("user_id", userId),
    ]);

    const byCat: Record<string, { income: number; expense: number }> = {};
    const byMonth: Record<string, { income: number; expense: number }> = {};
    let balance = 0;
    for (const t of txs ?? []) {
      const amt = Number(t.amount);
      const m = String(t.occurred_on).slice(0, 7);
      byMonth[m] ??= { income: 0, expense: 0 };
      byCat[t.category] ??= { income: 0, expense: 0 };
      if (t.type === "income") { byMonth[m].income += amt; byCat[t.category].income += amt; balance += amt; }
      else { byMonth[m].expense += amt; byCat[t.category].expense += amt; balance -= amt; }
    }

    const activeSubs = (subs ?? []).filter((s: any) => s.is_active);
    const subsTotal = activeSubs.reduce((a: number, s: any) => a + Number(s.amount), 0);
    const openDebts = (debts ?? []).filter((d: any) => !d.is_settled);
    const upcomingShifts = (shifts ?? []).filter((s: any) => !s.paid);

    const payload = {
      currency: "RUB",
      balance: Math.round(balance),
      period_days: 90,
      monthly: Object.entries(byMonth).sort().map(([m, v]) => ({
        month: m, income: Math.round(v.income), expense: Math.round(v.expense),
      })),
      categories: Object.entries(byCat)
        .map(([c, v]) => ({ category: c, income: Math.round(v.income), expense: Math.round(v.expense) }))
        .sort((a, b) => b.expense - a.expense)
        .slice(0, 20),
      active_subscriptions: activeSubs.map((s: any) => ({ name: s.name, amount: Number(s.amount), day: s.charge_day })),
      subscriptions_monthly_total: Math.round(subsTotal),
      open_debts: openDebts.map((d: any) => ({
        counterparty: d.counterparty, amount: Number(d.amount), direction: d.direction, due_date: d.due_date,
      })),
      upcoming_shifts: upcomingShifts.slice(0, 20).map((s: any) => ({ date: s.shift_date, amount: Number(s.amount) })),
    };

    const system =
      "Ты персональный финансовый консультант. Отвечай только валидным JSON. Все суммы в рублях. " +
      "Будь конкретным: ссылайся на категории и подписки из данных. Не выдумывай цифры.";
    const user =
      `Проанализируй финансы пользователя и дай рекомендации, как сэкономить и увеличить накопления. ` +
      `Учти баланс, ежемесячные подписки, долги, регулярные доходы (смены), топ-категории расходов и динамику по месяцам. ` +
      `Верни JSON строго в формате: {"summary":"2-3 предложения общего вывода","recommendations":["конкретный совет 1","совет 2",...],"warnings":["важное предупреждение если есть",...]}. ` +
      `5-8 рекомендаций. Данные:\n${JSON.stringify(payload)}`;

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      console.error("AI insights request failed:", e);
      return { summary: "", recommendations: [], warnings: [], error: "AI сервис недоступен" };
    }

    if (res.status === 429) return { summary: "", recommendations: [], warnings: [], error: "Слишком много запросов. Попробуйте позже." };
    if (res.status === 402) return { summary: "", recommendations: [], warnings: [], error: "Закончились AI-кредиты." };
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, txt);
      return { summary: "", recommendations: [], warnings: [], error: `Ошибка AI (${res.status})` };
    }

    const json = await res.json().catch(() => null) as any;
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }

    return {
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations.map(String).slice(0, 12) : [],
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).slice(0, 6) : [],
      error: null,
    };
  });
