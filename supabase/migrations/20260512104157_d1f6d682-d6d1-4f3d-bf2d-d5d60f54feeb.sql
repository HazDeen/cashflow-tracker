
-- Связь транзакции с подпиской (для автосписаний)
ALTER TABLE public.transactions
  ADD COLUMN subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;

CREATE INDEX idx_tx_subscription ON public.transactions(subscription_id) WHERE subscription_id IS NOT NULL;

-- =====================================================================
-- RPC: агрегаты дашборда — считаются в БД одним запросом
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(uid UUID)
RETURNS TABLE(balance NUMERIC, pending_subs NUMERIC, total_subs NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  last_day INT := EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + INTERVAL '1 month - 1 day'))::int;
  current_day INT := EXTRACT(DAY FROM today)::int;
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
      FROM public.transactions t
      WHERE t.user_id = uid
    ), 0)::numeric AS balance,
    COALESCE((
      SELECT SUM(s.amount) FROM public.subscriptions s
      WHERE s.user_id = uid AND s.is_active
        AND LEAST(s.charge_day::int, last_day) >= current_day
    ), 0)::numeric AS pending_subs,
    COALESCE((
      SELECT SUM(s.amount) FROM public.subscriptions s
      WHERE s.user_id = uid AND s.is_active
    ), 0)::numeric AS total_subs;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID) TO authenticated;

-- =====================================================================
-- Автосписание подписок: создаёт expense-транзакцию в день списания
-- Идемпотентно: NOT EXISTS защищает от повторов в рамках месяца
-- =====================================================================
CREATE OR REPLACE FUNCTION public.process_subscription_charges()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INT;
  today DATE := CURRENT_DATE;
  last_day INT := EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + INTERVAL '1 month - 1 day'))::int;
  current_day INT := EXTRACT(DAY FROM today)::int;
BEGIN
  WITH ins AS (
    INSERT INTO public.transactions (user_id, type, amount, category, comment, occurred_on, subscription_id)
    SELECT s.user_id, 'expense', s.amount, 'Подписки', s.name, today, s.id
    FROM public.subscriptions s
    WHERE s.is_active
      AND LEAST(s.charge_day::int, last_day) = current_day
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.subscription_id = s.id
          AND t.occurred_on >= date_trunc('month', today::timestamp)::date
          AND t.occurred_on <  (date_trunc('month', today::timestamp) + INTERVAL '1 month')::date
      )
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO inserted FROM ins;
  RETURN COALESCE(inserted, 0);
END;
$$;

-- =====================================================================
-- pg_cron: ежедневный запуск автосписаний (00:05 UTC)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'process-subscription-charges',
  '5 0 * * *',
  $$ SELECT public.process_subscription_charges(); $$
);
