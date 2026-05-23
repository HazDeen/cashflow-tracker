-- Reminders
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  note text,
  remind_on date NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders" ON public.reminders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_reminders_user_date ON public.reminders(user_id, remind_on);

-- Payment confirmations (one row per credit/debt payment-period)
CREATE TABLE public.payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('credit','debt')),
  ref_id uuid NOT NULL,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','skipped')),
  asked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (user_id, kind, ref_id, due_on)
);
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payment_confirmations" ON public.payment_confirmations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_payment_confirmations_user ON public.payment_confirmations(user_id, status);
