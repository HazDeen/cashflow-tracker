// Единый список категорий — используется в форме операций, AI-распознавании и статистике.
import {
  ShoppingCart, UtensilsCrossed, Coffee, ShoppingBag,
  Bus, Car, Fuel, Plane,
  Home, Zap, Wifi, Repeat,
  Gamepad2, Film, Music,
  HeartPulse, Pill, Sparkles,
  Shirt, Smartphone, GraduationCap, Dumbbell,
  Baby, Dog, Gift, Send, Landmark, HandCoins,
  Wallet, Briefcase, TrendingUp, RotateCcw, Package,
  type LucideIcon,
} from "lucide-react";

export type CategoryKind = "expense" | "income" | "both";

export type CategoryDef = {
  name: string;
  icon: LucideIcon;
  kind: CategoryKind;
  color: string; // tailwind text color class, used for icon tint
};

export const CATEGORIES: CategoryDef[] = [
  // Expenses — повседневные
  { name: "Продукты",      icon: ShoppingCart,    kind: "expense", color: "text-emerald-500" },
  { name: "Кафе и рестораны", icon: UtensilsCrossed, kind: "expense", color: "text-orange-500" },
  { name: "Кофейни",       icon: Coffee,          kind: "expense", color: "text-amber-600" },
  { name: "Маркетплейсы",  icon: ShoppingBag,     kind: "expense", color: "text-fuchsia-500" },
  // Transport
  { name: "Транспорт",     icon: Bus,             kind: "expense", color: "text-sky-500" },
  { name: "Такси",         icon: Car,             kind: "expense", color: "text-yellow-500" },
  { name: "Топливо",       icon: Fuel,            kind: "expense", color: "text-red-500" },
  { name: "Путешествия",   icon: Plane,           kind: "expense", color: "text-cyan-500" },
  // Housing
  { name: "Жильё",         icon: Home,            kind: "expense", color: "text-indigo-500" },
  { name: "ЖКХ",           icon: Zap,             kind: "expense", color: "text-yellow-600" },
  { name: "Связь и интернет", icon: Wifi,         kind: "expense", color: "text-blue-500" },
  { name: "Подписки",      icon: Repeat,          kind: "expense", color: "text-violet-500" },
  // Lifestyle
  { name: "Развлечения",   icon: Gamepad2,        kind: "expense", color: "text-pink-500" },
  { name: "Кино и шоу",    icon: Film,            kind: "expense", color: "text-rose-500" },
  { name: "Музыка",        icon: Music,           kind: "expense", color: "text-purple-500" },
  // Health
  { name: "Здоровье",      icon: HeartPulse,      kind: "expense", color: "text-red-400" },
  { name: "Аптека",        icon: Pill,            kind: "expense", color: "text-rose-400" },
  { name: "Красота",       icon: Sparkles,        kind: "expense", color: "text-pink-400" },
  // Goods
  { name: "Одежда",        icon: Shirt,           kind: "expense", color: "text-teal-500" },
  { name: "Электроника",   icon: Smartphone,      kind: "expense", color: "text-slate-500" },
  // Education / sport
  { name: "Образование",   icon: GraduationCap,   kind: "expense", color: "text-blue-600" },
  { name: "Спорт",         icon: Dumbbell,        kind: "expense", color: "text-lime-600" },
  // Family
  { name: "Дети",          icon: Baby,            kind: "expense", color: "text-pink-300" },
  { name: "Питомцы",       icon: Dog,             kind: "expense", color: "text-amber-500" },
  // Money flow
  { name: "Подарки",       icon: Gift,            kind: "both",    color: "text-rose-500" },
  { name: "Переводы",      icon: Send,            kind: "both",    color: "text-blue-400" },
  { name: "Налоги и штрафы", icon: Landmark,      kind: "expense", color: "text-stone-500" },
  { name: "Долги",         icon: HandCoins,       kind: "both",    color: "text-orange-600" },
  // Income
  { name: "Зарплата",      icon: Wallet,          kind: "income",  color: "text-emerald-600" },
  { name: "Работа",        icon: Briefcase,       kind: "income",  color: "text-emerald-500" },
  { name: "Инвестиции",    icon: TrendingUp,      kind: "income",  color: "text-green-500" },
  { name: "Возврат",       icon: RotateCcw,       kind: "income",  color: "text-teal-500" },
  // Fallback
  { name: "Прочее",        icon: Package,         kind: "both",    color: "text-muted-foreground" },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

export function categoriesFor(type: "expense" | "income"): CategoryDef[] {
  return CATEGORIES.filter((c) => c.kind === type || c.kind === "both");
}

export function getCategory(name: string): CategoryDef {
  return CATEGORIES.find((c) => c.name === name) ?? CATEGORIES[CATEGORIES.length - 1];
}
