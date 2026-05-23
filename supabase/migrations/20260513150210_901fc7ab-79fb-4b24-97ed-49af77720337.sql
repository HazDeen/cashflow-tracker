-- 1. Cashback table extensions
ALTER TABLE public.cashbacks
  ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT 'Банк',
  ADD COLUMN IF NOT EXISTS payout_day smallint,
  ADD COLUMN IF NOT EXISTS notify_days_before smallint NOT NULL DEFAULT 2;

UPDATE public.cashbacks
  SET bank_name = COALESCE(NULLIF(card_name, ''), name)
  WHERE bank_name = 'Банк';

-- 2. Payouts log
CREATE TABLE IF NOT EXISTS public.cashback_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bank_name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payout_on date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  details jsonb,
  status text NOT NULL DEFAULT 'pending',
  notified_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, bank_name, period_start)
);
ALTER TABLE public.cashback_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cashback_payouts" ON public.cashback_payouts;
CREATE POLICY "own cashback_payouts" ON public.cashback_payouts
  FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- 3. Per-category calculation
CREATE OR REPLACE FUNCTION public.get_cashback_calc()
RETURNS TABLE(id uuid, bank_name text, category text, percent numeric, payout_day smallint,
  monthly_limit numeric, spent numeric, accrued numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
  WITH spent AS (
    SELECT t.category AS cat, SUM(t.amount)::numeric AS total
    FROM public.transactions t
    WHERE t.user_id=uid AND t.type='expense'
      AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date
    GROUP BY t.category
  )
  SELECT c.id, c.bank_name, c.category, c.percent, c.payout_day, c.monthly_limit,
    COALESCE(s.total, 0)::numeric AS spent,
    LEAST(COALESCE(s.total,0) * c.percent / 100.0, COALESCE(c.monthly_limit, 1e12))::numeric AS accrued
  FROM public.cashbacks c
  LEFT JOIN spent s ON s.cat = c.category
  WHERE c.user_id=uid AND c.is_active;
END $$;

-- 4. Bank summary for the bot reminder
CREATE OR REPLACE FUNCTION public.get_cashback_bank_summary(p_user uuid)
RETURNS TABLE(bank_name text, payout_day smallint, total numeric, details jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH calc AS (
    SELECT c.bank_name, c.payout_day, c.category, c.percent, c.monthly_limit,
      COALESCE((SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id=p_user AND t.type='expense' AND t.category=c.category
          AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric AS spent
    FROM public.cashbacks c
    WHERE c.user_id=p_user AND c.is_active AND c.payout_day IS NOT NULL
  ), accrued AS (
    SELECT bank_name, payout_day, category, percent, spent,
      LEAST(spent * percent / 100.0, COALESCE(monthly_limit, 1e12))::numeric AS amount
    FROM calc
  )
  SELECT bank_name, payout_day,
    SUM(amount)::numeric AS total,
    jsonb_agg(jsonb_build_object('category', category, 'percent', percent, 'spent', spent, 'amount', amount)
      ORDER BY amount DESC) AS details
  FROM accrued
  GROUP BY bank_name, payout_day;
$$;

-- 5. Confirm payout (with optional override amount)
CREATE OR REPLACE FUNCTION public.confirm_cashback_payout(_payout_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); p record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO p FROM public.cashback_payouts WHERE id=_payout_id AND user_id=uid;
  IF p IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  UPDATE public.cashback_payouts
    SET status='confirmed', total_amount=_amount, resolved_at=now()
    WHERE id=_payout_id;
  INSERT INTO public.transactions(user_id, type, amount, category, comment, occurred_on)
    VALUES (uid, 'income', _amount, 'Кэшбэк', p.bank_name, CURRENT_DATE);
END $$;

CREATE OR REPLACE FUNCTION public.reject_cashback_payout(_payout_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.cashback_payouts
    SET status='rejected', resolved_at=now()
    WHERE id=_payout_id AND user_id=uid;
END $$;

-- 6. Generate pending payouts for users whose payout-day is approaching
CREATE OR REPLACE FUNCTION public.create_pending_cashback_payouts()
RETURNS TABLE(payout_id uuid, user_id uuid, bank_name text, total numeric, chat_id bigint, payout_on date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH banks AS (
    SELECT c.user_id, c.bank_name, MIN(c.payout_day) AS payout_day, MAX(c.notify_days_before) AS notify_days_before
    FROM public.cashbacks c
    WHERE c.is_active AND c.payout_day IS NOT NULL
    GROUP BY c.user_id, c.bank_name
  ), targets AS (
    SELECT b.*,
      make_date(EXTRACT(YEAR FROM today)::int, EXTRACT(MONTH FROM today)::int,
        LEAST(b.payout_day::int,
          EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int)) AS payout_on
    FROM banks b
  ), due AS (
    SELECT t.user_id, t.bank_name, t.payout_on,
      date_trunc('month', t.payout_on::timestamp)::date AS period_start,
      (date_trunc('month', t.payout_on::timestamp) + interval '1 month - 1 day')::date AS period_end
    FROM targets t
    WHERE t.payout_on - today BETWEEN 0 AND t.notify_days_before
  ), inserted AS (
    INSERT INTO public.cashback_payouts(user_id, bank_name, period_start, period_end, payout_on, total_amount, details, status, notified_at)
    SELECT d.user_id, d.bank_name, d.period_start, d.period_end, d.payout_on,
      COALESCE(s.total, 0), COALESCE(s.details, '[]'::jsonb), 'pending', now()
    FROM due d
    LEFT JOIN LATERAL (
      SELECT total, details FROM public.get_cashback_bank_summary(d.user_id)
      WHERE bank_name = d.bank_name LIMIT 1
    ) s ON true
    ON CONFLICT (user_id, bank_name, period_start) DO NOTHING
    RETURNING id, user_id, bank_name, total_amount, payout_on
  )
  SELECT i.id, i.user_id, i.bank_name, i.total_amount, p.telegram_chat_id, i.payout_on
  FROM inserted i
  LEFT JOIN public.profiles p ON p.id = i.user_id;
END $$;