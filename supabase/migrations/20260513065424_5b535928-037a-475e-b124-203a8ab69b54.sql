CREATE TABLE public.credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  total_payable NUMERIC NOT NULL,
  monthly_payment NUMERIC NOT NULL,
  payment_day SMALLINT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  months_total SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own credits" ON public.credits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_next_payment()
RETURNS TABLE(kind TEXT, title TEXT, amount NUMERIC, due_on DATE)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  today DATE := CURRENT_DATE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  RETURN QUERY
  WITH all_payments AS (
    -- Subscriptions: next charge date
    SELECT 'subscription'::text AS kind, s.name AS title, s.amount,
      CASE
        WHEN s.charge_day::int >= EXTRACT(DAY FROM today)::int
          THEN make_date(EXTRACT(YEAR FROM today)::int, EXTRACT(MONTH FROM today)::int,
               LEAST(s.charge_day::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int))
        ELSE make_date(EXTRACT(YEAR FROM (today + interval '1 month'))::int,
             EXTRACT(MONTH FROM (today + interval '1 month'))::int,
             LEAST(s.charge_day::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '2 month - 1 day'))::int))
      END AS due_on
    FROM public.subscriptions s
    WHERE s.user_id = uid AND s.is_active

    UNION ALL

    -- Debts: i_owe with due_date
    SELECT 'debt'::text, d.counterparty, d.amount, d.due_date
    FROM public.debts d
    WHERE d.user_id = uid AND NOT d.is_settled AND d.direction = 'i_owe' AND d.due_date IS NOT NULL AND d.due_date >= today

    UNION ALL

    -- Credits: next monthly payment
    SELECT 'credit'::text, c.name, c.monthly_payment,
      CASE
        WHEN c.payment_day::int >= EXTRACT(DAY FROM today)::int
          THEN make_date(EXTRACT(YEAR FROM today)::int, EXTRACT(MONTH FROM today)::int,
               LEAST(c.payment_day::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int))
        ELSE make_date(EXTRACT(YEAR FROM (today + interval '1 month'))::int,
             EXTRACT(MONTH FROM (today + interval '1 month'))::int,
             LEAST(c.payment_day::int, EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '2 month - 1 day'))::int))
      END
    FROM public.credits c
    WHERE c.user_id = uid AND c.is_active
  )
  SELECT p.kind, p.title, p.amount, p.due_on
  FROM all_payments p
  WHERE p.due_on >= today
  ORDER BY p.due_on ASC
  LIMIT 1;
END;
$$;