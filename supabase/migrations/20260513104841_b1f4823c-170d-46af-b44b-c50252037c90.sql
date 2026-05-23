
-- Unique constraint: one confirmation row per item per day
CREATE UNIQUE INDEX IF NOT EXISTS payment_confirmations_unique_idx
  ON public.payment_confirmations (user_id, kind, ref_id, due_on);

-- Function: create today's pending confirmations for credits & debts
CREATE OR REPLACE FUNCTION public.create_pending_payment_confirmations()
RETURNS TABLE(user_id uuid, kind text, ref_id uuid, title text, amount numeric, chat_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := CURRENT_DATE;
  current_day int := EXTRACT(DAY FROM today)::int;
  last_day int := EXTRACT(DAY FROM (date_trunc('month', today::timestamp) + interval '1 month - 1 day'))::int;
BEGIN
  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.payment_confirmations (user_id, kind, ref_id, due_on, status)
    SELECT c.user_id, 'credit', c.id, today, 'pending'
    FROM public.credits c
    WHERE c.is_active AND LEAST(c.payment_day::int, last_day) = current_day
    UNION ALL
    SELECT d.user_id, 'debt', d.id, today, 'pending'
    FROM public.debts d
    WHERE NOT d.is_settled AND d.direction = 'i_owe' AND d.due_date = today
    ON CONFLICT (user_id, kind, ref_id, due_on) DO NOTHING
    RETURNING user_id, kind, ref_id
  )
  SELECT
    i.user_id,
    i.kind,
    i.ref_id,
    CASE WHEN i.kind = 'credit' THEN c.name ELSE d.counterparty END AS title,
    CASE WHEN i.kind = 'credit' THEN c.monthly_payment ELSE d.amount END AS amount,
    p.telegram_chat_id AS chat_id
  FROM ins i
  LEFT JOIN public.credits c ON i.kind = 'credit' AND c.id = i.ref_id
  LEFT JOIN public.debts d ON i.kind = 'debt' AND d.id = i.ref_id
  LEFT JOIN public.profiles p ON p.id = i.user_id;
END;
$$;

-- Function: resolve a confirmation (yes -> apply changes, no -> just mark)
CREATE OR REPLACE FUNCTION public.resolve_payment_confirmation(_confirmation_id uuid, _confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  SELECT * INTO rec FROM public.payment_confirmations WHERE id = _confirmation_id;
  IF rec IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF rec.status <> 'pending' THEN RETURN; END IF;

  IF _confirmed THEN
    IF rec.kind = 'credit' THEN
      UPDATE public.credits
        SET paid_amount = paid_amount + monthly_payment,
            is_active = CASE WHEN paid_amount + monthly_payment >= total_payable THEN false ELSE is_active END
        WHERE id = rec.ref_id;
      INSERT INTO public.transactions (user_id, type, amount, category, comment, occurred_on)
        SELECT rec.user_id, 'expense', c.monthly_payment, 'Кредит', c.name, rec.due_on
        FROM public.credits c WHERE c.id = rec.ref_id;
    ELSIF rec.kind = 'debt' THEN
      UPDATE public.debts SET is_settled = true WHERE id = rec.ref_id;
      INSERT INTO public.transactions (user_id, type, amount, category, comment, occurred_on)
        SELECT rec.user_id, 'expense', d.amount, 'Долг', d.counterparty, rec.due_on
        FROM public.debts d WHERE d.id = rec.ref_id;
    END IF;
    UPDATE public.payment_confirmations SET status = 'yes', resolved_at = now() WHERE id = _confirmation_id;
  ELSE
    UPDATE public.payment_confirmations SET status = 'no', resolved_at = now() WHERE id = _confirmation_id;
  END IF;
END;
$$;
