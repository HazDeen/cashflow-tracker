import { createFileRoute } from "@tanstack/react-router";
import { getAdminClient, sendTelegramMessage } from "@/lib/telegram-bot.server";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

export const Route = createFileRoute("/api/public/hooks/daily-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const sb = getAdminClient();
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 86400000);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        const tomorrowDay = tomorrow.getDate();
        const lastDayOfMonth = new Date(tomorrow.getFullYear(), tomorrow.getMonth() + 1, 0).getDate();

        // Map user_id -> chat_id
        const { data: profiles } = await (sb as any)
          .from("profiles").select("user_id, telegram_chat_id")
          .not("telegram_chat_id", "is", null);

        const chatByUser = new Map<string, number>();
        for (const p of (profiles ?? []) as Array<{ user_id: string; telegram_chat_id: number }>) {
          chatByUser.set(p.user_id, p.telegram_chat_id);
        }

        // Tomorrow's shifts
        const { data: shifts } = await (sb as any)
          .from("work_shifts").select("user_id, amount, note")
          .eq("paid", false).eq("shift_date", tomorrowStr);

        for (const s of (shifts ?? []) as Array<any>) {
          const chat = chatByUser.get(s.user_id);
          if (!chat) continue;
          await sendTelegramMessage(
            chat,
            `🔔 Завтра смена: <b>+${fmt(Number(s.amount))} ₽</b>${s.note ? ` (${s.note})` : ""}`,
          );
        }

        // Tomorrow's subscription charges
        const { data: subs } = await sb
          .from("subscriptions").select("user_id, name, amount, charge_day")
          .eq("is_active", true);

        for (const s of (subs ?? []) as Array<any>) {
          const eff = Math.min(Number(s.charge_day), lastDayOfMonth);
          if (eff !== tomorrowDay) continue;
          const chat = chatByUser.get(s.user_id);
          if (!chat) continue;
          await sendTelegramMessage(
            chat,
            `🔁 Завтра спишется подписка <b>${s.name}</b>: −${fmt(Number(s.amount))} ₽`,
          );
        }

        // Debts due tomorrow
        const { data: debts } = await (sb as any)
          .from("debts").select("user_id, direction, counterparty, amount, due_date")
          .eq("is_settled", false).eq("due_date", tomorrowStr);

        for (const d of (debts ?? []) as Array<any>) {
          const chat = chatByUser.get(d.user_id);
          if (!chat) continue;
          const isOwe = d.direction === "i_owe";
          await sendTelegramMessage(
            chat,
            isOwe
              ? `⚠️ Завтра срок долга: ты должен <b>${d.counterparty}</b> ${fmt(Number(d.amount))} ₽`
              : `⚠️ Завтра срок долга: <b>${d.counterparty}</b> должен тебе ${fmt(Number(d.amount))} ₽`,
          );
        }

        // Personal reminders due tomorrow
        const { data: reminders } = await (sb as any)
          .from("reminders").select("user_id, title, note")
          .eq("is_done", false).eq("notified", false).eq("remind_on", tomorrowStr);

        for (const r of (reminders ?? []) as Array<any>) {
          const chat = chatByUser.get(r.user_id);
          if (!chat) continue;
          await sendTelegramMessage(
            chat,
            `🔔 Напоминание на завтра: <b>${r.title}</b>${r.note ? `\n${r.note}` : ""}`,
          );
          await (sb as any).from("reminders").update({ notified: true }).eq("user_id", r.user_id).eq("remind_on", tomorrowStr).eq("title", r.title);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
