import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: string;
  setAccent: (c: string) => void;
};

const ThemeCtx = createContext<Ctx>({
  theme: "light",
  setTheme: () => {},
  accent: "",
  setAccent: () => {},
});

const DEFAULT_ACCENT = "#3b82f6"; // соответствует исходному синему бренду

function applyAccent(color: string) {
  const root = document.documentElement;
  if (!color) {
    root.style.removeProperty("--brand");
    root.style.removeProperty("--brand-soft");
    return;
  }
  root.style.setProperty("--brand", color);
  root.style.setProperty(
    "--brand-soft",
    `color-mix(in oklab, ${color} 14%, transparent)`,
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [accent, setAccentState] = useState<string>("");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("theme")) as Theme | null;
    const initial: Theme = saved ?? "light";
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");

    const savedAccent = localStorage.getItem("accent") ?? "";
    setAccentState(savedAccent);
    if (savedAccent) applyAccent(savedAccent);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    const tg = (window as any).Telegram?.WebApp;
    const bg = t === "dark" ? "#0b0d12" : "#f7f8fa";
    tg?.setHeaderColor?.(bg);
    tg?.setBackgroundColor?.(bg);
  };

  const setAccent = (c: string) => {
    setAccentState(c);
    if (c) {
      localStorage.setItem("accent", c);
    } else {
      localStorage.removeItem("accent");
    }
    applyAccent(c);
  };

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, accent, setAccent }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: "Синий", value: "#3b82f6" },
  { name: "Индиго", value: "#6366f1" },
  { name: "Фиолетовый", value: "#8b5cf6" },
  { name: "Розовый", value: "#ec4899" },
  { name: "Красный", value: "#ef4444" },
  { name: "Оранжевый", value: "#f97316" },
  { name: "Зелёный", value: "#10b981" },
  { name: "Бирюзовый", value: "#14b8a6" },
];
export const DEFAULT_ACCENT_HEX = DEFAULT_ACCENT;
