import { createFileRoute } from "@tanstack/react-router";
import { getAdminClient } from "@/lib/telegram-bot.server";

const TG = "https://api.telegram.org";
const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n));

async function send(chatId: number, text: string, payoutId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${TG}/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[
        { text: "✅ Принять", callback_data: `cb:yes:${payoutId}` },
        { text: "✏️ Корректировать", callback_data: `cb:adj:${payoutId}` },
      ]] },
    }),
  });
}

export const Route = createFileRoute("/api/public/hooks/cashback-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const sb = getAdminClient();
        const { data, error } = await (sb as any).rpc("create_pending_cashback_payouts");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        const rows = (data ?? []) as Array<{ payout_id: string; user_id: string; bank_name: string; total: number; chat_id: number | null; payout_on: string }>;
        for (const r of rows) {
          if (!r.chat_id) continue;
          const { data: details } = await (sb as any)
            .from("cashback_payouts").select("details").eq("id", r.payout_id).maybeSingle();
          const lines = (details?.details ?? []).slice(0, 6)
            .map((d: any) => `• ${d.category} (${d.percent}%): +${fmt(d.amount)} ₽`).join("\n");
          const text =
            `💰 Скоро выплата кэшбэка по <b>${r.bank_name}</b> (${r.payout_on})\n\n` +
            `Расчёт: <b>+${fmt(r.total)} ₽</b>\n${lines}\n\nПринять или скорректировать?`;
          await send(r.chat_id, text, r.payout_id);
        }
        return Response.json({ ok: true, count: rows.length });
      },
    },
  },
});
