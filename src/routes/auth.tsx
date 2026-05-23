import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { telegramAuth } from "@/lib/telegram-auth.functions";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Финансы" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const tgAuth = useServerFn(telegramAuth);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      navigate({ to: "/" });
      return;
    }
    const initData = (window as any).Telegram?.WebApp?.initData as string | undefined;
    if (!initData) {
      setErr("Откройте приложение через Telegram");
      return;
    }
    tgAuth({ data: { initData } })
      .then(async ({ access_token, refresh_token }) => {
        await supabase.auth.setSession({ access_token, refresh_token });
        navigate({ to: "/" });
      })
      .catch((e: Error) => setErr(e.message));
  }, [session, tgAuth, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-background">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-3xl font-semibold">Финансы</h1>
        {err ? (
          <p className="text-sm text-destructive">{err}</p>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 rounded-full border-2 border-muted border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Авторизация через Telegram…</p>
          </>
        )}
      </div>
    </div>
  );
}
