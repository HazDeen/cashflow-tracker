// Server-only helpers for sending Telegram messages and building summaries.
import { createClient } from "@supabase/supabase-js";

const TG_API = "https://api.telegram.org";

export function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function tgCall(method: string, body: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`tg ${method} failed`, res.status, txt);
  }
  return res;
}

export async function setupBotMenu(miniAppUrl: string) {
  await tgCall("setMyCommands", {
    commands: [
      { command: "start", description: "Запустить и обновить данные" },
      { command: "open", description: "Открыть приложение" },
      { command: "stats", description: "Статистика за месяц" },
      { command: "balance", description: "Текущий баланс" },
      { command: "goals", description: "Цели и копилки" },
      { command: "upcoming", description: "Ближайшие события" },
      { command: "achievements", description: "Достижения и стрик" },
      { command: "help", description: "Помощь" },
    ],
  });
  await tgCall("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Открыть", web_app: { url: miniAppUrl } },
  });
}

export async function sendOpenAppMessage(chatId: number, miniAppUrl: string, text = "Открой приложение:") {
  await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[
        { text: "🚀 Открыть приложение", web_app: { url: miniAppUrl } },
        { text: "📊 Статистика", web_app: { url: `${miniAppUrl.replace(/\/$/, "")}/stats` } },
      ]],
    },
  });
}


export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("sendTelegramMessage failed", res.status, body);
  }
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

function daysLeftInMonth(today = new Date()) {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.max(1, last - today.getDate() + 1);
}

/** Build a personal summary as the given user (server-side, bypasses RLS). */
export async function buildUserSummary(userId: string): Promise<string> {
  const sb = getAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentDay = today.getDate();
  const daysLeft = daysLeftInMonth(today);

  const [{ data: txs }, { data: subs }, { data: shifts }, { data: debts }] = await Promise.all([
    sb.from("transactions").select("type, amount").eq("user_id", userId),
    sb.from("subscriptions").select("name, amount, charge_day, is_active").eq("user_id", userId).eq("is_active", true),
    (sb as any).from("work_shifts").select("shift_date, amount, note, paid").eq("user_id", userId).eq("paid", false).gte("shift_date", todayStr).order("shift_date", { ascending: true }),
    (sb as any).from("debts").select("direction, counterparty, amount, due_date").eq("user_id", userId).eq("is_settled", false),
  ]);

  const balance = (txs ?? []).reduce(
    (s: number, t: any) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)),
    0,
  );
  const pendingSubs = (subs ?? []).reduce((s: number, x: any) => {
    const eff = Math.min(Number(x.charge_day), lastDay);
    return eff >= currentDay ? s + Number(x.amount) : s;
  }, 0);
  const expectedIncome = (shifts ?? []).reduce(
    (s: number, x: any) => x.shift_date <= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` ? s + Number(x.amount) : s,
    0,
  );
  const myDebts = (debts ?? []).reduce(
    (s: number, d: any) => d.direction === "i_owe" ? s + Number(d.amount) : s,
    0,
  );
  const free = balance + expectedIncome - pendingSubs - myDebts;
  const dailyLimit = Math.max(0, Math.floor(free / daysLeft));
  const weeklyLimit = dailyLimit * 7;

  const lines: string[] = [];
  lines.push(`💰 <b>Баланс:</b> ${fmt(balance)} ₽`);
  lines.push(`📅 На день: <b>${fmt(dailyLimit)} ₽</b> · на неделю: <b>${fmt(weeklyLimit)} ₽</b>`);
  if (expectedIncome) lines.push(`💵 Ожидается: +${fmt(expectedIncome)} ₽`);
  if (pendingSubs) lines.push(`🔁 Подписки до конца месяца: −${fmt(pendingSubs)} ₽`);
  if (myDebts) lines.push(`🤝 Я должен: −${fmt(myDebts)} ₽`);

  // Upcoming subs (next 3 in current month)
  const upcomingSubs = (subs ?? [])
    .map((x: any) => ({ ...x, eff: Math.min(Number(x.charge_day), lastDay) }))
    .filter((x: any) => x.eff >= currentDay)
    .sort((a: any, b: any) => a.eff - b.eff)
    .slice(0, 3);
  if (upcomingSubs.length) {
    lines.push("");
    lines.push("<b>Ближайшие списания:</b>");
    for (const s of upcomingSubs) lines.push(`  • ${s.eff}-го — ${s.name}: −${fmt(Number(s.amount))} ₽`);
  }

  const upcomingShifts = (shifts ?? []).slice(0, 3);
  if (upcomingShifts.length) {
    lines.push("");
    lines.push("<b>Ближайшие смены:</b>");
    for (const s of upcomingShifts) {
      const d = new Date(s.shift_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      lines.push(`  • ${d} — +${fmt(Number(s.amount))} ₽${s.note ? ` (${s.note})` : ""}`);
    }
  }

  return lines.join("\n");
}

export async function buildGoalsSummary(userId: string): Promise<string> {
  const sb = getAdminClient();
  const { data: goals } = await (sb as any).from("savings_goals")
    .select("name,emoji,target_amount,current_amount").eq("user_id", userId).order("created_at");
  if (!goals?.length) return "🎯 У тебя пока нет целей. Добавь первую в приложении!";
  const lines = ["<b>🎯 Цели и копилки:</b>", ""];
  for (const g of goals) {
    const cur = Number(g.current_amount), tgt = Number(g.target_amount);
    const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
    const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
    lines.push(`${g.emoji || "🎯"} <b>${g.name}</b>`);
    lines.push(`  ${bar} ${pct}%`);
    lines.push(`  ${fmt(cur)} / ${fmt(tgt)} ₽`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function buildUpcomingSummary(userId: string): Promise<string> {
  const sb = getAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  const in14Str = in14.toISOString().slice(0, 10);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const [{ data: subs }, { data: shifts }, { data: reminders }, { data: credits }] = await Promise.all([
    sb.from("subscriptions").select("name,amount,charge_day").eq("user_id", userId).eq("is_active", true),
    (sb as any).from("work_shifts").select("shift_date,amount,note").eq("user_id", userId)
      .gte("shift_date", todayStr).lte("shift_date", in14Str).order("shift_date"),
    (sb as any).from("reminders").select("title,amount,remind_on").eq("user_id", userId)
      .eq("is_done", false).gte("remind_on", todayStr).lte("remind_on", in14Str).order("remind_on"),
    (sb as any).from("credits").select("name,monthly_payment,payment_day").eq("user_id", userId).eq("is_closed", false),
  ]);

  const events: { date: string; text: string }[] = [];
  for (const s of subs ?? []) {
    const day = Math.min(Number((s as any).charge_day), lastDay);
    if (day >= today.getDate()) {
      const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({ date: d, text: `🔁 ${(s as any).name}: −${fmt(Number((s as any).amount))} ₽` });
    }
  }
  for (const c of credits ?? []) {
    const day = Math.min(Number(c.payment_day), lastDay);
    if (day >= today.getDate()) {
      const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      events.push({ date: d, text: `💳 ${c.name}: −${fmt(Number(c.monthly_payment))} ₽` });
    }
  }
  for (const s of shifts ?? []) events.push({ date: s.shift_date, text: `💼 Смена: +${fmt(Number(s.amount))} ₽${s.note ? ` (${s.note})` : ""}` });
  for (const r of reminders ?? []) events.push({ date: r.remind_on, text: `⏰ ${r.title}${r.amount ? `: ${fmt(Number(r.amount))} ₽` : ""}` });

  events.sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return "📅 На ближайшие 2 недели событий нет";
  const lines = ["<b>📅 Ближайшие 14 дней:</b>", ""];
  for (const e of events.slice(0, 20)) {
    const d = new Date(e.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    lines.push(`<b>${d}</b> — ${e.text}`);
  }
  return lines.join("\n");
}

export async function buildAchievementsSummary(userId: string): Promise<string> {
  const sb = getAdminClient();
  await (sb as any).rpc("evaluate_achievements", { p_user: userId });
  const { data } = await (sb as any).rpc("get_user_gamification", { p_user: userId });
  const g = data as any;
  const lines = [
    `🔥 Стрик: <b>${g?.current_streak ?? 0}</b> дн. (рекорд ${g?.longest_streak ?? 0})`,
    `📅 Активных дней: ${g?.total_days ?? 0}`,
    "",
    `<b>🏆 Достижения (${g?.achievements?.length ?? 0}):</b>`,
  ];
  for (const a of (g?.achievements ?? []).slice(0, 15)) {
    lines.push(`${a.icon} <b>${a.title}</b> — ${a.description}`);
  }
  if (!g?.achievements?.length) lines.push("Пока пусто. Добавляй операции и открывай ачивки!");
  return lines.join("\n");
}
