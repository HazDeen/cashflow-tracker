// Чистые финансовые вычисления — изолированы для тестируемости и мемоизации.

export type Tx = { type: "income" | "expense"; amount: number };
export type Sub = { amount: number; charge_day: number; is_active: boolean };

export function calcBalance(txs: Tx[]): number {
  let s = 0;
  for (const t of txs) s += t.type === "income" ? t.amount : -t.amount;
  return s;
}

/** Сумма подписок, которые ещё спишутся до конца текущего месяца. */
export function pendingSubsThisMonth(subs: Sub[], today = new Date()): number {
  const day = today.getDate();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let total = 0;
  for (const s of subs) {
    if (!s.is_active) continue;
    // Если день списания > длины месяца (напр. 31 в феврале) — спишется в последний день.
    const effective = Math.min(s.charge_day, lastDay);
    if (effective >= day) total += s.amount;
  }
  return total;
}

export function daysLeftInMonth(today = new Date()): number {
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.max(1, lastDay - today.getDate() + 1); // включая сегодня
}

/** Дневной лимит = (баланс − ожидающие подписки) / оставшиеся дни. */
export function dailyLimit(balance: number, pendingSubs: number, today = new Date()): number {
  const free = balance - pendingSubs;
  return free / daysLeftInMonth(today);
}
