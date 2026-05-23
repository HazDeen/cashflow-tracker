import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { TabBar } from "@/components/TabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, Coins, ChevronDown, ChevronRight, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { categoriesFor, getCategory } from "@/lib/categories";

const ALL_PURCHASES = "Все покупки";
const CUSTOM_OPTION = "__custom";

// Популярные магазины-партнёры (часто выпадают в Т-Банке и других банках)
const PARTNER_STORES = [
  "Красное и Белое", "Пятёрочка", "Перекрёсток", "Магнит", "Лента",
  "ВкусВилл", "Ашан", "Метро", "Окей", "Дикси",
  "Винлаб", "Бристоль", "Лукойл", "Газпромнефть", "Роснефть",
  "Wildberries", "Ozon", "Яндекс Маркет", "Мегамаркет", "AliExpress",
  "DNS", "М.Видео", "Эльдорадо", "Ситилинк", "Леруа Мерлен",
  "ИКЕА", "OBI", "Спортмастер", "Декатлон", "H&M",
  "Zara", "Uniqlo", "Золотое Яблоко", "Л'Этуаль", "Рив Гош",
  "Аптека 36.6", "Ригла", "Горздрав", "Яндекс Такси", "Яндекс Еда",
  "Delivery Club", "Самокат", "KFC", "Burger King", "McDonald's",
  "Vkusno i tochka", "Starbucks", "Шоколадница", "Кофемания", "Додо Пицца",
];

export const Route = createFileRoute("/cashbacks")({
  component: CashbacksPage,
  head: () => ({ meta: [{ title: "Кэшбэк — Финансы" }] }),
});

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Bank = { id: string; name: string; color: string };

type Calc = {
  id: string; bank_name: string; bank_id: string | null; category: string;
  percent: number; payout_day: number | null;
  monthly_limit: number | null; spent: number; accrued: number;
};

type Pending = {
  id: string; bank_name: string; payout_on: string; total_amount: number;
  status: string; details: any;
};

function CashbacksPage() {
  const nav = useNavigate();
  const { session, loading } = useSession();
  useEffect(() => { if (!loading && !session) nav({ to: "/auth" }); }, [loading, session, nav]);
  const userId = session?.user.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Calc | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: calc } = useQuery<Calc[]>({
    queryKey: ["cashback-calc", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_cashback_calc");
      if (error) throw error;
      return (data ?? []) as Calc[];
    },
  });

  const { data: pending } = useQuery<Pending[]>({
    queryKey: ["cashback-pending", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("cashback_payouts")
        .select("*").eq("user_id", userId!).eq("status", "pending").order("payout_on");
      if (error) throw error;
      return (data ?? []) as Pending[];
    },
  });

  const { data: userBanks } = useQuery<Bank[]>({
    queryKey: ["banks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("banks")
        .select("id,name,color").eq("user_id", userId!).order("created_at");
      return (data ?? []) as Bank[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { bank: string; payout_day: number | null; rows: Calc[]; total: number }>();
    for (const c of calc ?? []) {
      const k = c.bank_name;
      const g = map.get(k) ?? { bank: c.bank_name, payout_day: c.payout_day, rows: [], total: 0 };
      g.rows.push(c); g.total += Number(c.accrued); g.payout_day = g.payout_day ?? c.payout_day;
      map.set(k, g);
    }
    return Array.from(map.values());
  }, [calc]);

  const totalAccrued = grouped.reduce((s, g) => s + g.total, 0);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cashbacks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback-calc", userId] }),
  });

  const confirm = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await (supabase as any).rpc("confirm_cashback_payout", { _payout_id: id, _amount: amount });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Кэшбэк зачислен");
      setAdjustId(null); setAdjustAmount("");
      qc.invalidateQueries({ queryKey: ["cashback-pending", userId] });
      qc.invalidateQueries({ queryKey: ["dashboard", userId] });
    },
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("reject_cashback_payout", { _payout_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback-pending", userId] }),
  });

  if (!session) return null;

  return (
    <div className="min-h-screen pb-28">
      <header className="px-5 pt-7 pb-3 flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:bg-muted">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-semibold flex-1">Кэшбэк</h1>
        <Button size="icon" onClick={() => { setEditing(null); setOpen(true); }} className="rounded-full h-10 w-10">
          <Plus size={18} />
        </Button>
      </header>

      <section className="mx-5 rounded-2xl bg-gradient-to-br from-brand to-brand/70 text-primary-foreground p-5">
        <p className="text-xs opacity-80 uppercase tracking-wider">Накоплено в этом месяце</p>
        <p className="text-3xl font-mono font-semibold mt-1">+{fmt.format(totalAccrued)} ₽</p>
        <p className="text-xs opacity-80 mt-1">по всем банкам и категориям</p>
      </section>

      {(pending ?? []).length > 0 && (
        <div className="mx-5 mt-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground px-1">Ожидают подтверждения</p>
          {pending!.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="font-medium flex-1">{p.bank_name}</span>
                <span className="text-xs text-muted-foreground">{p.payout_on}</span>
              </div>
              <p className="text-2xl font-mono font-semibold mt-2 text-income">+{fmt.format(p.total_amount)} ₽</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button variant="outline" onClick={() => { setAdjustId(p.id); setAdjustAmount(String(p.total_amount)); }}>
                  <Pencil size={14} /> Корректировать
                </Button>
                <Button onClick={() => confirm.mutate({ id: p.id, amount: p.total_amount })}>
                  <Check size={14} /> Принять
                </Button>
              </div>
              <button onClick={() => reject.mutate(p.id)}
                className="text-xs text-muted-foreground hover:text-destructive mt-2 w-full text-center">
                Отклонить
              </button>
            </div>
          ))}
        </div>
      )}

      <ul className="mx-5 mt-4 space-y-2">
        {grouped.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Добавь первый банк и категорию кэшбэка</p>
        )}
        {grouped.map((g) => {
          const isOpen = expanded[g.bank] ?? true;
          return (
            <li key={g.bank} className="rounded-2xl bg-card border overflow-hidden">
              <button onClick={() => setExpanded(s => ({ ...s, [g.bank]: !isOpen }))}
                className="w-full flex items-center gap-3 p-4 text-left">
                <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-soft text-brand">
                  <Coins size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.bank}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.rows.length} {g.rows.length === 1 ? "категория" : "категорий"}
                    {g.payout_day ? ` · выплата ${g.payout_day}-го` : " · день выплаты не задан"}
                  </p>
                </div>
                <span className="font-mono text-income text-sm">+{fmt.format(g.total)} ₽</span>
                {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
              </button>
              {isOpen && (
                <ul className="border-t divide-y divide-border bg-muted/20">
                  {g.rows.map((c) => {
                    const limitHit = c.monthly_limit && c.spent * c.percent / 100 >= c.monthly_limit;
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{c.category} · <span className="text-brand font-medium">{c.percent}%</span></p>
                          <p className="text-xs text-muted-foreground">
                            Потрачено {fmt.format(c.spent)} ₽
                            {c.monthly_limit ? ` · лимит ${fmt.format(c.monthly_limit)} ₽${limitHit ? " (достигнут)" : ""}` : ""}
                          </p>
                        </div>
                        <span className="font-mono text-sm text-income">+{fmt.format(c.accrued)} ₽</span>
                        <button onClick={() => { setEditing(c); setOpen(true); }} className="p-2 text-muted-foreground hover:text-brand">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => del.mutate(c.id)} className="p-2 text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <CashbackSheet open={open} onOpenChange={setOpen} userId={userId} initial={editing} banks={userBanks ?? []} />

      <Sheet open={!!adjustId} onOpenChange={(v) => !v && setAdjustId(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader><SheetTitle>Корректировать сумму</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <Input type="number" placeholder="Фактическая сумма" value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)} className="h-12 rounded-xl" autoFocus />
            <Button className="w-full h-12 rounded-xl" onClick={() => {
              const n = Number(adjustAmount);
              if (!n || !adjustId) return;
              confirm.mutate({ id: adjustId, amount: n });
            }}>Принять и зачислить</Button>
          </div>
        </SheetContent>
      </Sheet>

      <TabBar />
    </div>
  );
}

function CashbackSheet({ open, onOpenChange, userId, initial, banks }: {
  open: boolean; onOpenChange: (v: boolean) => void; userId?: string;
  initial: Calc | null; banks: Bank[];
}) {
  const qc = useQueryClient();
  const expenseCats = categoriesFor("expense");
  const presetNames = [ALL_PURCHASES, ...expenseCats.map((c) => c.name), ...PARTNER_STORES];
  const [bankId, setBankId] = useState("");
  const [categorySel, setCategorySel] = useState<string>(ALL_PURCHASES);
  const [customCategory, setCustomCategory] = useState("");
  const [percent, setPercent] = useState("");
  const [limit, setLimit] = useState("");
  const [payoutDay, setPayoutDay] = useState("");

  const category = categorySel === CUSTOM_OPTION ? customCategory.trim() : categorySel;

  useEffect(() => {
    if (!open) return;
    setBankId(initial?.bank_id ?? banks[0]?.id ?? "");
    const initCat = initial?.category ?? ALL_PURCHASES;
    if (initCat && !presetNames.includes(initCat)) {
      setCategorySel(CUSTOM_OPTION);
      setCustomCategory(initCat);
    } else {
      setCategorySel(initCat);
      setCustomCategory("");
    }
    setPercent(initial ? String(initial.percent) : "");
    setLimit(initial?.monthly_limit ? String(initial.monthly_limit) : "");
    setPayoutDay(initial?.payout_day ? String(initial.payout_day) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, banks]);

  const save = useMutation({
    mutationFn: async () => {
      const bank = banks.find((b) => b.id === bankId);
      if (!bank) throw new Error("Выбери банк");
      const payload = {
        user_id: userId, bank_id: bank.id, bank_name: bank.name, name: bank.name, category,
        percent: Number(percent) || 0,
        monthly_limit: limit ? Number(limit) : null,
        payout_day: payoutDay ? Number(payoutDay) : null,
      };
      if (initial) {
        const { error } = await (supabase as any).from("cashbacks").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("cashbacks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(initial ? "Сохранено" : "Добавлено");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["cashback-calc", userId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Ошибка"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader><SheetTitle>{initial ? "Редактировать" : "Новая категория кэшбэка"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          {banks.length === 0 ? (
            <div className="rounded-xl bg-muted p-4 text-sm">
              Сначала добавь банк в разделе <Link to="/banks" className="text-brand font-medium">Профиль → Банки</Link>.
            </div>
          ) : (
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Выбери банк">
                  {bankId && (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: banks.find(b => b.id === bankId)?.color }} />
                      {banks.find(b => b.id === bankId)?.name}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={categorySel} onValueChange={setCategorySel}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue>
                {categorySel === CUSTOM_OPTION ? "Свой вариант" : (() => {
                  if (categorySel === ALL_PURCHASES) return "🛒 Все покупки";
                  if (PARTNER_STORES.includes(categorySel)) return `🏬 ${categorySel}`;
                  const c = getCategory(categorySel);
                  const Icon = c.icon;
                  return <span className="inline-flex items-center gap-2"><Icon size={16} className={c.color} />{c.name}</span>;
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ALL_PURCHASES}>🛒 Все покупки</SelectItem>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Категории</div>
              {expenseCats.map(({ name, icon: Icon, color }) => (
                <SelectItem key={name} value={name}>
                  <span className="inline-flex items-center gap-2"><Icon size={16} className={color} />{name}</span>
                </SelectItem>
              ))}
              <div className="px-2 py-1 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Магазины-партнёры</div>
              {PARTNER_STORES.map((s) => (
                <SelectItem key={s} value={s}>🏬 {s}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_OPTION}>✏️ Свой вариант</SelectItem>
            </SelectContent>
          </Select>
          {categorySel === CUSTOM_OPTION && (
            <Input placeholder="Своя категория" value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)} className="h-12 rounded-xl" autoFocus />
          )}
          <Input type="number" placeholder="Процент кэшбэка" value={percent}
            onChange={(e) => setPercent(e.target.value)} className="h-12 rounded-xl" />
          <Input type="number" placeholder="Месячный лимит ₽ (необязательно)" value={limit}
            onChange={(e) => setLimit(e.target.value)} className="h-12 rounded-xl" />
          <Input type="number" placeholder="День выплаты (1–31)" value={payoutDay}
            onChange={(e) => setPayoutDay(e.target.value)} className="h-12 rounded-xl" />
          <p className="text-xs text-muted-foreground">
            Кэшбэк считается по операциям с категорией «{category || "…"}», оплаченным выбранным банком.
            За пару дней до выплаты бот пришлёт сводку с суммой и кнопками «Принять» и «Корректировать».
          </p>
          <Button className="w-full h-12 rounded-xl" disabled={!bankId || !percent || !category}
            onClick={() => save.mutate()}>Сохранить</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
