
DROP FUNCTION IF EXISTS public.get_cashback_calc();
CREATE FUNCTION public.get_cashback_calc()
 RETURNS TABLE(id uuid, bank_name text, bank_id uuid, category text, percent numeric, payout_day smallint, monthly_limit numeric, spent numeric, accrued numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
  -- 1) explicit cashback rules
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
  WHERE c.user_id=uid AND c.is_active

  UNION ALL

  -- 2) implicit base 1% per bank (purchases >= 100 not covered by any explicit category)
  SELECT
    ('00000000-0000-0000-0000-' || lpad(to_hex(abs(hashtext(b.bank_id::text))), 12, '0'))::uuid AS id,
    b.bank_name, b.bank_id::uuid, 'Остальные покупки'::text, 1::numeric AS percent,
    b.payout_day::smallint, NULL::numeric AS monthly_limit,
    COALESCE(spent.s, 0)::numeric AS spent,
    (COALESCE(spent.s, 0) * 0.01)::numeric AS accrued
  FROM (
    SELECT DISTINCT c.bank_id, c.bank_name, MIN(c.payout_day) OVER (PARTITION BY c.bank_id) AS payout_day
    FROM public.cashbacks c
    WHERE c.user_id=uid AND c.is_active AND c.bank_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cashbacks c2
        WHERE c2.user_id=uid AND c2.is_active AND c2.bank_id = c.bank_id AND c2.category = 'Все покупки'
      )
  ) b
  LEFT JOIN LATERAL (
    SELECT SUM(t.amount) AS s FROM public.transactions t
    WHERE t.user_id=uid AND t.type='expense' AND t.amount >= 100
      AND t.bank_id = b.bank_id
      AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date
      AND NOT EXISTS (
        SELECT 1 FROM public.cashbacks c3
        WHERE c3.user_id=uid AND c3.is_active AND c3.bank_id = b.bank_id
          AND c3.category = t.category
      )
  ) spent ON true
  WHERE COALESCE(spent.s, 0) > 0;
END $function$;

DROP FUNCTION IF EXISTS public.get_cashback_bank_summary(uuid);
CREATE FUNCTION public.get_cashback_bank_summary(p_user uuid)
 RETURNS TABLE(bank_name text, payout_day smallint, total numeric, details jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH explicit AS (
    SELECT c.bank_name, c.payout_day, c.category, c.percent, c.monthly_limit, c.bank_id,
      COALESCE((SELECT SUM(t.amount) FROM public.transactions t
        WHERE t.user_id=p_user AND t.type='expense'
          AND (c.category = 'Все покупки' OR t.category = c.category)
          AND (c.bank_id IS NULL OR t.bank_id = c.bank_id)
          AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric AS spent
    FROM public.cashbacks c
    WHERE c.user_id=p_user AND c.is_active AND c.payout_day IS NOT NULL
  ), explicit_acc AS (
    SELECT bank_name, payout_day, category, percent, spent, bank_id,
      LEAST(spent * percent / 100.0, COALESCE(monthly_limit, 1e12))::numeric AS amount
    FROM explicit
  ), base AS (
    SELECT b.bank_name, b.payout_day, 'Остальные покупки'::text AS category, 1::numeric AS percent,
      COALESCE(s.s, 0)::numeric AS spent,
      (COALESCE(s.s, 0) * 0.01)::numeric AS amount
    FROM (
      SELECT DISTINCT c.bank_id, c.bank_name, MIN(c.payout_day) OVER (PARTITION BY c.bank_id) AS payout_day
      FROM public.cashbacks c
      WHERE c.user_id=p_user AND c.is_active AND c.bank_id IS NOT NULL AND c.payout_day IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.cashbacks c2
          WHERE c2.user_id=p_user AND c2.is_active AND c2.bank_id=c.bank_id AND c2.category='Все покупки'
        )
    ) b
    LEFT JOIN LATERAL (
      SELECT SUM(t.amount) AS s FROM public.transactions t
      WHERE t.user_id=p_user AND t.type='expense' AND t.amount >= 100 AND t.bank_id=b.bank_id
        AND t.occurred_on >= date_trunc('month', CURRENT_DATE)::date
        AND NOT EXISTS (
          SELECT 1 FROM public.cashbacks c3
          WHERE c3.user_id=p_user AND c3.is_active AND c3.bank_id=b.bank_id AND c3.category=t.category
        )
    ) s ON true
    WHERE COALESCE(s.s, 0) > 0
  ), all_rows AS (
    SELECT bank_name, payout_day, category, percent, spent, amount FROM explicit_acc
    UNION ALL
    SELECT bank_name, payout_day, category, percent, spent, amount FROM base
  )
  SELECT bank_name, payout_day,
    SUM(amount)::numeric AS total,
    jsonb_agg(jsonb_build_object('category', category, 'percent', percent, 'spent', spent, 'amount', amount)
      ORDER BY amount DESC) AS details
  FROM all_rows
  GROUP BY bank_name, payout_day;
$function$;
