import { createFileRoute } from "@tanstack/react-router";
import {
  getAdminClient,
  sendTelegramMessage,
  buildUserSummary,
  setupBotMenu,
  sendOpenAppMessage,
  buildGoalsSummary,
  buildUpcomingSummary,
  buildAchievementsSummary,
} from "@/lib/telegram-bot.server";

const MINI_APP_URL =
  process.env.TELEGRAM_MINI_APP_URL ||
  "https://cashflowtrach4zdeen.lovable.app";

let menuConfigured = false;

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!menuConfigured) {
            menuConfigured = true;
            setupBotMenu(MINI_APP_URL).catch((e) => console.error("setupBotMenu", e));
          }

          const update = await request.json();
          const sb = getAdminClient();

          // Handle inline button callbacks (Yes/No on payment confirmations)
          if (update.callback_query) {
            const cq = update.callback_query;
            const data: string = cq.data ?? "";
            const cqChatId: number | undefined = cq.message?.chat?.id;
            const cqMsgId: number | undefined = cq.message?.message_id;
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const m = data.match(/^pc:(yes|no):(.+)$/);
            const cb = data.match(/^cb:(yes|adj):(.+)$/);
            if (m && token) {
              const confirmed = m[1] === "yes";
              const id = m[2];
              const { error } = await (sb as any).rpc("resolve_payment_confirmation", {
                _confirmation_id: id, _confirmed: confirmed,
              });
              const reply = error
                ? "Не удалось обработать ответ"
                : confirmed ? "✅ Отмечено как оплачено" : "❌ Отмечено: не оплачено";
              await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: cq.id, text: reply }),
              });
              if (cqChatId && cqMsgId) {
                await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: cqChatId, message_id: cqMsgId, reply_markup: { inline_keyboard: [] } }),
                });
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: cqChatId, text: reply }),
                });
              }
            } else if (cb && token) {
              const action = cb[1]; const payoutId = cb[2];
              if (action === "yes") {
                const { data: pr } = await (sb as any).from("cashback_payouts").select("total_amount").eq("id", payoutId).maybeSingle();
                await (sb as any).rpc("confirm_cashback_payout", { _payout_id: payoutId, _amount: Number(pr?.total_amount ?? 0) });
                await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ callback_query_id: cq.id, text: "Зачислено" }),
                });
                if (cqChatId && cqMsgId) {
                  await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: cqChatId, message_id: cqMsgId, reply_markup: { inline_keyboard: [] } }),
                  });
                }
              } else {
                await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ callback_query_id: cq.id, text: "Открой раздел Кэшбэк в приложении и укажи фактическую сумму" }),
                });
              }
            }
            return Response.json({ ok: true });
          }

          const message = update.message ?? update.edited_message;
          const chatId: number | undefined = message?.chat?.id;
          const fromId: number | undefined = message?.from?.id;
          const text: string = message?.text ?? "";

          if (!chatId || !fromId) return Response.json({ ok: true, ignored: true });
          const { data: profile } = await (sb as any)
            .from("profiles")
            .select("user_id")
            .eq("telegram_chat_id", fromId)
            .maybeSingle();

          const cmd = text.split(/\s+/)[0]?.split("@")[0];

          if (cmd === "/start") {
            if (!profile?.user_id) {
              await sendOpenAppMessage(
                chatId,
                MINI_APP_URL,
                "Привет! Открой мини-приложение, чтобы войти и связать аккаунт.",
              );
            } else {
              // Обновляем привязку chat_id и метку времени
              await (sb as any)
                .from("profiles")
                .update({ telegram_chat_id: fromId, updated_at: new Date().toISOString() })
                .eq("user_id", profile.user_id);
              const summary = await buildUserSummary(profile.user_id);
              await sendTelegramMessage(chatId, summary);
              await sendOpenAppMessage(chatId, MINI_APP_URL);
            }
            return Response.json({ ok: true });
          }

          if (cmd === "/stats") {
            if (!profile?.user_id) {
              await sendOpenAppMessage(chatId, MINI_APP_URL, "Сначала войди в приложение:");
            } else {
              const summary = await buildUserSummary(profile.user_id);
              await sendTelegramMessage(chatId, summary);
            }
            return Response.json({ ok: true });
          }

          if (cmd === "/open") {
            await sendOpenAppMessage(chatId, MINI_APP_URL);
            return Response.json({ ok: true });
          }

          if (cmd === "/balance") {
            if (!profile?.user_id) {
              await sendOpenAppMessage(chatId, MINI_APP_URL, "Сначала войди в приложение:");
            } else {
              const summary = await buildUserSummary(profile.user_id);
              await sendTelegramMessage(chatId, summary);
            }
            return Response.json({ ok: true });
          }

          if (cmd === "/goals" || cmd === "/upcoming" || cmd === "/achievements") {
            if (!profile?.user_id) {
              await sendOpenAppMessage(chatId, MINI_APP_URL, "Сначала войди в приложение:");
            } else {
              const text = cmd === "/goals"
                ? await buildGoalsSummary(profile.user_id)
                : cmd === "/upcoming"
                ? await buildUpcomingSummary(profile.user_id)
                : await buildAchievementsSummary(profile.user_id);
              await sendTelegramMessage(chatId, text);
            }
            return Response.json({ ok: true });
          }

          if (cmd === "/help") {
            await sendTelegramMessage(
              chatId,
              "Команды:\n/start — войти и обновить данные\n/open — открыть приложение\n/stats — статистика за месяц\n/balance — текущий баланс\n/goals — цели и копилки\n/upcoming — ближайшие события\n/achievements — достижения и стрик\n/help — помощь",
            );
            return Response.json({ ok: true });
          }

          return Response.json({ ok: true });
        } catch (e) {
          console.error("telegram webhook error", e);
          return Response.json({ ok: true });
        }
      },
    },
  },
});
