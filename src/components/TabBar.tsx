import { Link, useLocation } from "@tanstack/react-router";
import { Home, Receipt, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function TabBar() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const tabs = [
    { to: "/", label: t("home"), icon: Home },
    { to: "/transactions", label: t("operations"), icon: Receipt },
    { to: "/profile", label: t("profile"), icon: User },
  ] as const;

  return (
    <nav className="fixed bottom-0 inset-x-0 border-t border-border bg-card/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md grid grid-cols-3">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link key={to} to={to}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand" : "text-muted-foreground"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
