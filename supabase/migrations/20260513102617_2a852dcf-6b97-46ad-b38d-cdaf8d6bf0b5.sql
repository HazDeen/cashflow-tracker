
-- Profiles: добавляем имя и эмодзи для приветствия
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS greeting_emoji text;

-- Подписки: период
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS period_unit text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS period_value smallint NOT NULL DEFAULT 1;

-- Зарплата
CREATE TABLE IF NOT EXISTS public.salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL,
  payment_days smallint[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own salaries" ON public.salaries;
CREATE POLICY "own salaries" ON public.salaries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Обновляем get_next_payment с учётом зарплаты ближайшим доходом нет, но для подписок учтём period
CREATE OR REPLACE FUNCTION public.get_next_income()
RETURNS TABLE(kind text, title text, amount numeric, due_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  today date := CURRENT_DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  WITH all_inc AS (
    -- Смены
    SELECT 'shift'::text AS kind, COALESCE(w.note, 'Смена') AS title, w.amount, w.shift_date AS due_on
    FROM public.work_shifts w
    WHERE w.user_id = uid AND NOT w.paid AND w.shift_date >= today

    UNION ALL

    -- Зарплаты: ближайший день из payment_days
    SELECT 'salary'::text, s.name, s.amount,
      (SELECT MIN(d) FROM (
        SELECT make_date(EXTRACT(YEAR FROM today)::int, EXTRACT(MONTH FROM today)::int,
               LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int)) AS d
        FROM unnest(s.payment_days) AS pd
        WHERE LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int) >= EXTRACT(DAY FROM today)::int
        UNION ALL
        SELECT make_date(EXTRACT(YEAR FROM (today + interval '1 month'))::int,
               EXTRACT(MONTH FROM (today + interval '1 month'))::int,
               LEAST(pd::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '2 month - 1 day'))::int))
        FROM unnest(s.payment_days) AS pd
      ) x)
    FROM public.salaries s
    WHERE s.user_id = uid AND s.is_active AND array_length(s.payment_days, 1) > 0
  )
  SELECT a.kind, a.title, a.amount, a.due_on
  FROM all_inc a
  WHERE a.due_on IS NOT NULL AND a.due_on >= today
  ORDER BY a.due_on ASC
  LIMIT 1;
END;
$$;
