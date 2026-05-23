import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { TabBar } from "@/components/TabBar";
import { useTheme, ACCENT_PRESETS, DEFAULT_ACCENT_HEX } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { tgUser, haptic } from "@/lib/telegram";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorPickerSheet } from "@/components/ColorPickerSheet";
import {
  Sun, Moon, Globe, LogOut, Repeat, ChevronRight, Settings,
  CalendarDays, HandCoins, BarChart3, Sparkles, CreditCard, Palette, Check, Pencil, Wallet, AlarmClock,
  Target, TrendingUp, Coins, CalendarRange, Trophy, Users, Landmark,
} from "lucide-react";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const EMOJIS = ["👋", "😎", "🚀", "🔥", "💸", "✨", "🌟", "🎯", "💼", "🦄", "☕", "🌈", "❤️", "🤍"];

function ProfilePage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const { lang, setLang, t } = useI18n();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const userId = session?.user.id;

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("display_name, greeting_emoji, emergency_months").eq("id", userId!).maybeSingle();
      return data as { display_name: string | null; greeting_emoji: string | null; emergency_months: number | null } | null;
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (patch: { display_name?: string; greeting_emoji?: string; emergency_months?: number }) => {
      const { error } = await (supabase as any).from("profiles").upsert({ id: userId!, ...patch });
      if (error) throw error;
    },
    onSuccess: () => {
      haptic("light");
      qc.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  if (!session) return null;

  const tg = tgUser();
  const fallback = tg?.first_name ?? session.user.email?.split("@")[0] ?? "user";
  const name = profile?.display_name || fallback;
  const emoji = profile?.greeting_emoji || "👋";
  const initial = name.slice(0, 1).toUpperCase();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-5">
        <h1 className="text-2xl font-semibold">{t("profile")}</h1>
      </header>

      <ProfileHeader
        avatarUrl={tg?.photo_url}
        name={name}
        emoji={emoji}
        initial={initial}
        onSave={(n, e) => updateProfile.mutate({ display_name: n, greeting_emoji: e })}
      />

      <section className="mx-5 mt-6">
        <div className="rounded-2xl bg-card border divide-y divide-border overflow-hidden">
          <NavRow to="/subscriptions" icon={<Repeat size={18} />} label={t("subscriptions")} />
          <NavRow to="/shifts" icon={<CalendarDays size={18} />} label={t("shifts")} />
          <NavRow to="/salaries" icon={<Wallet size={18} />} label="Зарплата" />
          <NavRow to="/extra-incomes" icon={<TrendingUp size={18} />} label="Доп. доходы" />
          <NavRow to="/debts" icon={<HandCoins size={18} />} label={t("debts")} />
          <NavRow to="/credits" icon={<CreditCard size={18} />} label="Кредиты" />
          <NavRow to="/goals" icon={<Target size={18} />} label="Цели и копилки" />
          <NavRow to="/reminders" icon={<AlarmClock size={18} />} label="Напоминания" />
          <NavRow to="/banks" icon={<Landmark size={18} />} label="Банки" />
          <NavRow to="/cashbacks" icon={<Coins size={18} />} label="Кэшбэк" />
          <NavRow to="/calendar" icon={<CalendarRange size={18} />} label="Финансовый календарь" />
          <NavRow to="/shared" icon={<Users size={18} />} label="Совместный бюджет" />
          <NavRow to="/stats" icon={<BarChart3 size={18} />} label="Статистика за месяц" />
          <NavRow to="/achievements" icon={<Trophy size={18} />} label="Достижения" />
          <NavRow to="/ai-insights" icon={<Sparkles size={18} />} label="AI рекомендации" />

        </div>
      </section>

      <section className="mx-5 mt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
          <Settings size={12} /> {t("settings")}
        </p>
        <div className="rounded-2xl bg-card border divide-y divide-border overflow-hidden">
          <Row icon={theme === "dark" ? <Moon size={18} /> : <Sun size={18} />} label={t("theme")}>
            <Segmented value={theme} onChange={(v) => setTheme(v as "light" | "dark")}
              options={[{ value: "light", label: t("light") }, { value: "dark", label: t("dark") }]} />
          </Row>
          <AccentRow accent={accent} setAccent={setAccent} />
          <Row icon={<Globe size={18} />} label={t("language")}>
            <Segmented value={lang} onChange={(v) => setLang(v as "ru" | "en")}
              options={[{ value: "ru", label: "RU" }, { value: "en", label: "EN" }]} />
          </Row>
          <Row icon={<HandCoins size={18} />} label="Подушка (мес.)">
            <select
              value={profile?.emergency_months ?? 6}
              onChange={(e) => updateProfile.mutate({ emergency_months: Number(e.target.value) })}
              className="h-9 rounded-lg bg-muted border-0 px-2 text-sm">
              {[3, 4, 5, 6, 9, 12].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Row>
        </div>
      </section>

      <div className="mx-5 mt-6">
        <Button variant="outline" onClick={logout}
          className="w-full h-12 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
          <LogOut size={18} /> {t("logout")}
        </Button>
      </div>

      <TabBar />
    </div>
  );
}

function ProfileHeader({
  avatarUrl, name, emoji, initial, onSave,
}: {
  avatarUrl?: string; name: string; emoji: string; initial: string;
  onSave: (name: string, emoji: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);
  const [newEmoji, setNewEmoji] = useState(emoji);
  const [customMode, setCustomMode] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");

  const start = () => {
    setNewName(name); setNewEmoji(emoji);
    setCustomMode(!EMOJIS.includes(emoji));
    setCustomEmoji(EMOJIS.includes(emoji) ? "" : emoji);
    setEditing(true);
  };
  const save = () => {
    const finalEmoji = customMode ? (customEmoji.trim() || newEmoji) : newEmoji;
    onSave(newName.trim() || name, finalEmoji);
    setEditing(false);
  };

  return (
    <section className="mx-5 rounded-2xl bg-card border p-5">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14 ring-2 ring-brand-soft">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback className="bg-brand text-primary-foreground text-lg">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold truncate flex items-center gap-1.5">
            {name} <span>{emoji}</span>
          </p>
        </div>
        <button onClick={start} className="p-2 rounded-lg text-muted-foreground hover:text-brand hover:bg-muted transition">
          <Pencil size={16} />
        </button>
      </div>

      {editing && (
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Имя</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground px-1">Эмодзи приветствия</label>
            <div className="grid grid-cols-7 gap-1.5">
              {EMOJIS.map(e => (
                <button key={e} type="button"
                  onClick={() => { setNewEmoji(e); setCustomMode(false); }}
                  className={`h-10 rounded-lg text-xl transition ${!customMode && newEmoji === e ? "bg-brand-soft ring-2 ring-brand" : "bg-muted"}`}>
                  {e}
                </button>
              ))}
              <button type="button" onClick={() => setCustomMode(true)}
                className={`h-10 rounded-lg text-[10px] font-medium transition ${customMode ? "bg-brand-soft ring-2 ring-brand" : "bg-muted"}`}>
                Свой
              </button>
            </div>
            {customMode && (
              <Input autoFocus value={customEmoji} onChange={(e) => setCustomEmoji(e.target.value)}
                placeholder="Введите свой эмодзи"
                maxLength={4}
                className="h-11 rounded-xl text-center text-xl mt-2" />
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={save} className="flex-1 h-11 rounded-xl">Сохранить</Button>
            <Button variant="outline" onClick={() => setEditing(false)} className="h-11 rounded-xl">Отмена</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function NavRow({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 active:bg-muted transition">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-soft text-brand">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight size={18} className="text-muted-foreground" />
    </Link>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-muted text-foreground">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex p-0.5 bg-muted rounded-lg">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AccentRow({ accent, setAccent }: { accent: string; setAccent: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const current = accent || DEFAULT_ACCENT_HEX;
  const isCustom = !!accent && !ACCENT_PRESETS.some((p) => p.value.toLowerCase() === accent.toLowerCase());

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-muted text-foreground">
          <Palette size={18} />
        </span>
        <span className="flex-1 text-left text-sm font-medium">Акцентный цвет</span>
        <span className="w-6 h-6 rounded-full border border-border shadow-inner" style={{ backgroundColor: current }} />
        <ChevronRight size={18} className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 pl-12 pr-1 space-y-3">
          <div className="grid grid-cols-8 gap-2">
            {ACCENT_PRESETS.map((p) => {
              const active = (accent || DEFAULT_ACCENT_HEX).toLowerCase() === p.value.toLowerCase();
              return (
                <button key={p.value} type="button" title={p.name}
                  onClick={() => setAccent(p.value === DEFAULT_ACCENT_HEX ? "" : p.value)}
                  className="relative aspect-square rounded-full border border-border transition hover:scale-110"
                  style={{ backgroundColor: p.value }}>
                  {active && <Check size={14} className="absolute inset-0 m-auto text-white drop-shadow" />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setPickerOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-xs font-medium hover:bg-accent transition">
              <span className="w-4 h-4 rounded-full border border-border"
                style={{ backgroundColor: isCustom ? accent : "transparent" }} />
              {isCustom ? "Свой цвет" : "Выбрать свой"}
            </button>
            {accent && (
              <button type="button" onClick={() => setAccent("")}
                className="text-xs text-muted-foreground hover:text-foreground">Сбросить</button>
            )}
          </div>
        </div>
      )}

      <ColorPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={current}
        onChange={(c) => setAccent(c)}
      />
    </div>
  );
}
