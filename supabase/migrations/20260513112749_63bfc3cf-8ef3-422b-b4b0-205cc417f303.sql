
-- Cashback tracker
CREATE TABLE public.cashbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Кэшбэк',
  percent numeric NOT NULL DEFAULT 0,
  card_name text,
  monthly_limit numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cashbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cashbacks" ON public.cashbacks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Log cashback as income
CREATE OR REPLACE FUNCTION public.add_cashback_income(_cashback_id uuid, _amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  c record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO c FROM cashbacks WHERE id=_cashback_id AND user_id=uid;
  IF c IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  INSERT INTO transactions (user_id, type, amount, category, comment, occurred_on)
    VALUES (uid, 'income', _amount, 'Кэшбэк', c.name, CURRENT_DATE);
END;
$$;

-- Unified calendar events
CREATE OR REPLACE FUNCTION public.get_calendar_events(_from date, _to date)
RETURNS TABLE(d date, kind text, title text, amount numeric, direction text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur date;
  last_day int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  cur := _from;
  WHILE cur <= _to LOOP
    last_day := EXTRACT(DAY FROM (date_trunc('month', cur::timestamp) + interval '1 month - 1 day'))::int;
    -- subscriptions
    RETURN QUERY
      SELECT cur, 'subscription'::text, s.name, s.amount, 'expense'::text
      FROM subscriptions s
      WHERE s.user_id=uid AND s.is_active
        AND LEAST(s.charge_day::int, last_day) = EXTRACT(DAY FROM cur)::int;
    -- credits
    RETURN QUERY
      SELECT cur, 'credit'::text, c.name, c.monthly_payment, 'expense'::text
      FROM credits c
      WHERE c.user_id=uid AND c.is_active
        AND LEAST(c.payment_day::int, last_day) = EXTRACT(DAY FROM cur)::int;
    -- salaries
    RETURN QUERY
      SELECT cur, 'salary'::text, sa.name, sa.amount, 'income'::text
      FROM salaries sa
      WHERE sa.user_id=uid AND sa.is_active
        AND EXTRACT(DAY FROM cur)::int = ANY(sa.payment_days);
    -- shifts
    RETURN QUERY
      SELECT cur, 'shift'::text, COALESCE(w.note,'Смена'), w.amount, 'income'::text
      FROM work_shifts w
      WHERE w.user_id=uid AND w.shift_date=cur;
    -- extra incomes
    RETURN QUERY
      SELECT cur, 'extra'::text, e.name, e.amount, 'income'::text
      FROM extra_incomes e
      WHERE e.user_id=uid AND e.is_active AND e.next_date=cur;
    -- reminders
    RETURN QUERY
      SELECT cur, 'reminder'::text, r.title, 0::numeric, 'neutral'::text
      FROM reminders r
      WHERE r.user_id=uid AND NOT r.is_done AND r.remind_on=cur;
    -- debts (i_owe with due_date)
    RETURN QUERY
      SELECT cur, 'debt'::text, dd.counterparty, dd.amount,
        CASE WHEN dd.direction='i_owe' THEN 'expense' ELSE 'income' END
      FROM debts dd
      WHERE dd.user_id=uid AND NOT dd.is_settled AND dd.due_date=cur;
    cur := cur + 1;
  END LOOP;
END;
$$;
