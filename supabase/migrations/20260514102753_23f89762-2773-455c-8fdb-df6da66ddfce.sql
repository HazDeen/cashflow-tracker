
-- 1. banks table
CREATE TABLE IF NOT EXISTS public.banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#FFDD2D',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own banks" ON public.banks;
CREATE POLICY "own banks" ON public.banks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. bank_id columns
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bank_id uuid;
ALTER TABLE public.cashbacks ADD COLUMN IF NOT EXISTS bank_id uuid;

CREATE INDEX IF NOT EXISTS idx_tx_bank ON public.transactions(bank_id) WHERE bank_id IS NOT NULL;

-- 3. updated cashback calc supporting "Все покупки"
DROP FUNCTION IF EXISTS public.get_cashback_calc();
CREATE FUNCTION public.get_cashback_calc()
 RETURNS TABLE(id uuid, bank_name text, bank_id uuid, category text, percent numeric, payout_day smallint, monthly_limit numeric, spent numeric, accrued numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
  SELECT c.id, c.bank_name, c.bank_id, c.category, c.percent, c.payout_day, c.monthly_limit,
    COALESCE((SELECT SUM(t.amount) FROM public.transactions t
      WHERE t.user_id=uid AND t.type='expense'
        AND (c.category = 'Все покупки' OR t.category = c.category)
        AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
        AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric AS spent,
    LEAST(
      COALESCE((SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id=uid AND t.type='expense'
          AND (c.category = 'Все покупки' OR t.category = c.category)
          AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
          AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0) * c.percent / 100.0,
      COALESCE(c.monthly_limit, 1e12)
    )::numeric AS accrued
  FROM public.cashbacks c
  WHERE c.user_id=uid AND c.is_active;
END $function$;

-- 4. updated bank summary supporting "Все покупки"
DROP FUNCTION IF EXISTS public.get_cashback_bank_summary(uuid);
CREATE FUNCTION public.get_cashback_bank_summary(p_user uuid)
 RETURNS TABLE(bank_name text, payout_day smallint, total numeric, details jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH calc AS (
    SELECT c.bank_name, c.payout_day, c.category, c.percent, c.monthly_limit,
      COALESCE((SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id=p_user AND t.type='expense'
          AND (c.category = 'Все покупки' OR t.category = c.category)
          AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
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
$function$;
