
-- 1. Savings goals
CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '🎯',
  target_amount numeric NOT NULL,
  current_amount numeric NOT NULL DEFAULT 0,
  deadline date,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own savings_goals" ON public.savings_goals FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- 2. Extra regular incomes
CREATE TABLE public.extra_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL DEFAULT 'Доход',
  period_unit text NOT NULL DEFAULT 'month',
  period_value smallint NOT NULL DEFAULT 1,
  next_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extra_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own extra_incomes" ON public.extra_incomes FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- 3. Emergency fund target months
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_months smallint NOT NULL DEFAULT 6;

-- 4. Balance forecast RPC
CREATE OR REPLACE FUNCTION public.get_balance_forecast(_days int DEFAULT 30)
RETURNS TABLE(d date, balance numeric, delta numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := CURRENT_DATE;
  cur_balance numeric;
  i int;
  cur_date date;
  day_delta numeric;
  last_day_of_month int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0)
    INTO cur_balance FROM transactions WHERE user_id=uid;

  FOR i IN 0.._days LOOP
    cur_date := today + i;
    last_day_of_month := EXTRACT(DAY FROM (date_trunc('month', cur_date::timestamp) + interval '1 month - 1 day'))::int;
    day_delta := 0;

    -- Subscriptions
    day_delta := day_delta - COALESCE((
      SELECT SUM(s.amount) FROM subscriptions s
      WHERE s.user_id=uid AND s.is_active
        AND LEAST(s.charge_day::int, last_day_of_month) = EXTRACT(DAY FROM cur_date)::int
    ),0);

    -- Credits
    day_delta := day_delta - COALESCE((
      SELECT SUM(c.monthly_payment) FROM credits c
      WHERE c.user_id=uid AND c.is_active
        AND LEAST(c.payment_day::int, last_day_of_month) = EXTRACT(DAY FROM cur_date)::int
    ),0);

    -- Salaries
    day_delta := day_delta + COALESCE((
      SELECT SUM(sa.amount) FROM salaries sa
      WHERE sa.user_id=uid AND sa.is_active
        AND EXTRACT(DAY FROM cur_date)::int = ANY(sa.payment_days)
    ),0);

    -- Unpaid shifts
    day_delta := day_delta + COALESCE((
      SELECT SUM(w.amount) FROM work_shifts w
      WHERE w.user_id=uid AND NOT w.paid AND w.shift_date = cur_date
    ),0);

    -- Extra incomes (next_date match)
    day_delta := day_delta + COALESCE((
      SELECT SUM(e.amount) FROM extra_incomes e
      WHERE e.user_id=uid AND e.is_active AND e.next_date = cur_date
    ),0);

    IF i > 0 THEN
      cur_balance := cur_balance + day_delta;
    END IF;
    d := cur_date;
    balance := cur_balance;
    delta := day_delta;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 5. Update get_next_income to include extra_incomes
CREATE OR REPLACE FUNCTION public.get_next_income()
RETURNS TABLE(kind text, title text, amount numeric, due_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := CURRENT_DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  WITH all_inc AS (
    SELECT 'shift'::text AS kind, COALESCE(w.note,'Смена') AS title, w.amount, w.shift_date AS due_on
    FROM public.work_shifts w
    WHERE w.user_id=uid AND NOT w.paid AND w.shift_date>=today
    UNION ALL
    SELECT 'salary'::text, s.name, s.amount,
      (SELECT MIN(d) FROM (
        SELECT make_date(EXTRACT(YEAR FROM today)::int, EXTRACT(MONTH FROM today)::int,
               LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month',today::timestamp)+interval '1 month - 1 day'))::int)) AS d
        FROM unnest(s.payment_days) AS pd
        WHERE LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month',today::timestamp)+interval '1 month - 1 day'))::int) >= EXTRACT(DAY FROM today)::int
        UNION ALL
        SELECT make_date(EXTRACT(YEAR FROM (today+interval '1 month'))::int,
               EXTRACT(MONTH FROM (today+interval '1 month'))::int,
               LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month',today::timestamp)+interval '2 month - 1 day'))::int))
        FROM unnest(s.payment_days) AS pd
      ) x)
    FROM public.salaries s
    WHERE s.user_id=uid AND s.is_active AND array_length(s.payment_days,1)>0
    UNION ALL
    SELECT 'extra'::text, e.name, e.amount, e.next_date
    FROM public.extra_incomes e
    WHERE e.user_id=uid AND e.is_active AND e.next_date >= today
  )
  SELECT a.kind, a.title, a.amount, a.due_on
  FROM all_inc a
  WHERE a.due_on IS NOT NULL AND a.due_on >= today
  ORDER BY a.due_on ASC
  LIMIT 1;
END;
$$;

-- 6. Helper RPC: contribute to a savings goal
CREATE OR REPLACE FUNCTION public.contribute_to_goal(_goal_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  g record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO g FROM savings_goals WHERE id=_goal_id AND user_id=uid;
  IF g IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE savings_goals
    SET current_amount = current_amount + _amount,
        is_archived = CASE WHEN current_amount + _amount >= target_amount THEN true ELSE is_archived END
    WHERE id=_goal_id;
  INSERT INTO transactions (user_id, type, amount, category, comment, occurred_on)
    VALUES (uid, 'expense', _amount, 'Копилка', g.name, CURRENT_DATE);
END;
$$;

-- 7. Helper RPC: extra payment on credit (досрочное погашение)
CREATE OR REPLACE FUNCTION public.extra_credit_payment(_credit_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  uid uuid := auth.uid();
  c record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO c FROM credits WHERE id=_credit_id AND user_id=uid;
  IF c IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE credits
    SET paid_amount = paid_amount + _amount,
        is_active = CASE WHEN paid_amount + _amount >= total_payable THEN false ELSE is_active END
    WHERE id=_credit_id;
  INSERT INTO transactions (user_id, type, amount, category, comment, occurred_on)
    VALUES (uid, 'expense', _amount, 'Кредит', c.name || ' (досрочно)', CURRENT_DATE);
END;
$$;
