import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Validate Telegram WebApp initData per official spec:
 *   secret = HMAC_SHA256(key="WebAppData", msg=BOT_TOKEN)
 *   data_check_string = sorted "key=value\n..." (excluding "hash")
 *   expected_hash = HMAC_SHA256(secret, data_check_string)
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData: string, botToken: string):
  | { ok: true; user: { id: number; first_name?: string; username?: string } }
  | { ok: false; reason: string } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing hash" };

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    return { ok: false, reason: "stale initData" };
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => [k, v] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (expected !== hash) return { ok: false, reason: "bad hash" };

  const userJson = params.get("user");
  if (!userJson) return { ok: false, reason: "missing user" };
  try {
    const user = JSON.parse(userJson);
    if (typeof user?.id !== "number") return { ok: false, reason: "bad user.id" };
    return { ok: true, user };
  } catch {
    return { ok: false, reason: "bad user json" };
  }
}

/** Deterministic password derived from bot token + tg id — never leaves the server. */
function derivePassword(botToken: string, tgId: number): string {
  return createHmac("sha256", botToken).update(`tg:${tgId}`).digest("hex");
}

export const telegramAuth = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => {
    if (!d?.initData || typeof d.initData !== "string" || d.initData.length > 4096) {
      throw new Error("invalid initData");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

    const verdict = verifyInitData(data.initData, botToken);
    if (!verdict.ok) throw new Error(`Telegram auth failed: ${verdict.reason}`);

    const { user: tgUser } = verdict;
    const email = `tg_${tgUser.id}@telegram.local`;
    const password = derivePassword(botToken, tgUser.id);

    // Idempotent provisioning. Email is auto-confirmed for TMA users.
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        telegram_id: tgUser.id,
        telegram_username: tgUser.username,
        telegram_first_name: tgUser.first_name,
      },
    });
    // 422 = user already exists — expected on subsequent logins.
    if (createErr && !/already|exists|registered/i.test(createErr.message)) {
      throw createErr;
    }

    // Issue session via password grant on a fresh client (no admin context).
    const authClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: signed, error: signErr } = await authClient.auth.signInWithPassword({
      email, password,
    });
    if (signErr || !signed.session) throw signErr ?? new Error("signIn failed");

    // Save chat_id to profile so we can DM the user from cron / bot.
    await (supabaseAdmin as any).from("profiles").upsert(
      { user_id: signed.session.user.id, telegram_chat_id: tgUser.id },
      { onConflict: "user_id" },
    );

    return {
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });
