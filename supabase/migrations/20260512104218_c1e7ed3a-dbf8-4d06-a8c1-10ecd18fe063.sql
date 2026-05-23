
-- 1) Дашборд: используем auth.uid() напрямую (SECURITY INVOKER, RLS работает)
DROP FUNCTION IF EXISTS public.get_dashboard_stats(UUID);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(balance NUMERIC, pending_subs NUMERIC, total_subs NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  last_day INT := EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + INTERVAL '1 month - 1 day'))::int;
  current_day INT := EXTRACT(DAY FROM today)::int;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      FROM public.transactions t WHERE t.user_id = uid
    ), 0)::numeric,
    COALESCE((
      SELECT SUM(s.amount) FROM public.subscriptions s
      WHERE s.user_id = uid AND s.is_active
        AND LEAST(s.charge_day::int, last_day) >= current_day
    ), 0)::numeric,
    COALESCE((
      SELECT SUM(s.amount) FROM public.subscriptions s
      WHERE s.user_id = uid AND s.is_active
    ), 0)::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

-- 2) Автосписания: только владелец БД (cron). Закрываем доступ всем.
REVOKE ALL ON FUNCTION public.process_subscription_charges() FROM PUBLIC, anon, authenticated;
