
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
      WHERE t.user_id=uid AND t.type='expense' AND t.category=c.category
        AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
        AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric AS spent,
    LEAST(
      COALESCE((SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id=uid AND t.type='expense' AND t.category=c.category
          AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
          AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0) * c.percent / 100.0,
      COALESCE(c.monthly_limit, 1e12)
    )::numeric AS accrued
  FROM public.cashbacks c
  WHERE c.user_id=uid AND c.is_active;
END $function$;
