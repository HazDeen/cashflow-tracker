
drop function if exists public.get_dashboard_stats();

create or replace function public.get_dashboard_stats()
returns table(
  balance numeric,
  pending_subs numeric,
  total_subs numeric,
  expected_income numeric,
  my_debts numeric,
  daily_limit numeric,
  weekly_limit numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := current_date;
  last_day int := extract(day from (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int;
  current_day int := extract(day from today)::int;
  days_left int := greatest(1, last_day - current_day + 1);
  uid uuid := auth.uid();
  v_balance numeric;
  v_pending numeric;
  v_total numeric;
  v_expected numeric;
  v_debts numeric;
  v_free numeric;
  v_daily numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select coalesce(sum(case when t.type='income' then t.amount else -t.amount end),0)
    into v_balance from public.transactions t where t.user_id=uid;

  select coalesce(sum(s.amount),0) into v_pending
    from public.subscriptions s
    where s.user_id=uid and s.is_active
      and least(s.charge_day::int, last_day) >= current_day;

  select coalesce(sum(s.amount),0) into v_total
    from public.subscriptions s where s.user_id=uid and s.is_active;

  select coalesce(sum(w.amount),0) into v_expected
    from public.work_shifts w
    where w.user_id=uid and not w.paid
      and w.shift_date >= today
      and w.shift_date <= (date_trunc('month', today::timestamp) + interval '1 month - 1 day')::date;

  select coalesce(sum(d.amount),0) into v_debts
    from public.debts d
    where d.user_id=uid and not d.is_settled and d.direction='i_owe'
      and (d.due_date is null or d.due_date <= (date_trunc('month', today::timestamp) + interval '1 month - 1 day')::date);

  v_free := v_balance + v_expected - v_pending - v_debts;
  v_daily := v_free / days_left;

  return query select v_balance, v_pending, v_total, v_expected, v_debts, v_daily, v_daily * 7;
end;
$$;
