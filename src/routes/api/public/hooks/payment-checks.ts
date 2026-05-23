import { createFileRoute } from "@tanstack/react-router";
import { getAdminClient } from "@/lib/telegram-bot.server";

const TG_API = "https://api.telegram.org";
const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

async function sendWithButtons(chatId: number, text: string, confirmId: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Да", callback_data: `pc:yes:${confirmId}` },
          { text: "❌ Нет", callback_data: `pc:no:${confirmId}` },
        ]],
      },
    }),
  });
}

export const Route = createFileRoute("/api/public/hooks/payment-checks")({
  server: {
    handlers: {
      POST: async () => {
        const sb = getAdminClient();
        const { data, error } = await (sb as any).rpc("create_pending_payment_confirmations");
        if (error) {
          console.error("create_pending_payment_confirmations", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        const rows = (data ?? []) as Array<{
          user_id: string; kind: string; ref_id: string;
          title: string; amount: number; chat_id: number | null;
        }>;

        for (const r of rows) {
          // find the actual confirmation id (today)
          const { data: pc } = await (sb as any)
            .from("payment_confirmations")
            .select("id")
            .eq("user_id", r.user_id).eq("kind", r.kind).eq("ref_id", r.ref_id)
            .eq("due_on", new Date().toISOString().slice(0, 10))
            .maybeSingle();
          if (!pc?.id || !r.chat_id) continue;

          const label = r.kind === "credit" ? "кредиту" : "долгу";
          const text = `💳 Сегодня платёж по ${label} <b>${r.title}</b>: ${fmt(Number(r.amount))} ₽\n\nПрошла ли оплата?`;
          await sendWithButtons(r.chat_id, text, pc.id);
        }

        return Response.json({ ok: true, created: rows.length });
      },
    },
  },
});
