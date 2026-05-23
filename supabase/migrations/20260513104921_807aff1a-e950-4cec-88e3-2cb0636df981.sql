
CREATE OR REPLACE FUNCTION public.resolve_payment_confirmation(_confirmation_id uuid, _confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  uid uuid := auth.uid();
BEGIN
  SELECT * INTO rec FROM public.payment_confirmations WHERE id = _confirmation_id;
  IF rec IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF uid IS NOT NULL AND rec.user_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
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
