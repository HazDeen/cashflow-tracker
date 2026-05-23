// Минимальная типизация Telegram WebApp API.
type SafeAreaInset = { top: number; right: number; bottom: number; left: number };
type TgWebApp = {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  setHeaderColor: (c: string) => void;
  setBackgroundColor: (c: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  colorScheme: "light" | "dark";
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  };
  HapticFeedback?: { impactOccurred: (s: "light" | "medium" | "heavy") => void };
};

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

function applySafeAreaVars(tg: TgWebApp) {
  const root = document.documentElement;
  const sa = tg.safeAreaInset;
  const csa = tg.contentSafeAreaInset;
  const top = Math.max(sa?.top ?? 0, csa?.top ?? 0);
  const bottom = Math.max(sa?.bottom ?? 0, csa?.bottom ?? 0);
  if (top > 0) root.style.setProperty("--tg-safe-top", `${top}px`);
  if (bottom > 0) root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
}

export function initTelegram() {
  if (typeof window === "undefined") return null;
  const tg = window.Telegram?.WebApp;
  if (!tg) return null;
  tg.ready();
  tg.expand();
  try { tg.requestFullscreen?.(); } catch {}
  tg.setHeaderColor("#f7f8fa");
  tg.setBackgroundColor("#f7f8fa");
  applySafeAreaVars(tg);
  tg.onEvent?.("safeAreaChanged", () => applySafeAreaVars(tg));
  tg.onEvent?.("contentSafeAreaChanged", () => applySafeAreaVars(tg));
  tg.onEvent?.("fullscreenChanged", () => applySafeAreaVars(tg));
  return tg;
}

export function tgUser() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}
