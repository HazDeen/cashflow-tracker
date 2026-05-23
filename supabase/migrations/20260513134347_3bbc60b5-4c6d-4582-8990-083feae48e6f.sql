CREATE TABLE IF NOT EXISTS public.shared_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '👥',
  owner_id uuid NOT NULL,
  invite_code text NOT NULL UNIQUE,
  monthly_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_budget_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.shared_budgets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.shared_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES public.shared_budgets(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  amount numeric NOT NULL,
  category text NOT NULL DEFAULT 'Прочее',
  comment text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sbm_user_idx ON public.shared_budget_members(user_id);
CREATE INDEX IF NOT EXISTS sbm_budget_idx ON public.shared_budget_members(budget_id);
CREATE INDEX IF NOT EXISTS stx_budget_idx ON public.shared_transactions(budget_id);

ALTER TABLE public.shared_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_budget_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_transactions ENABLE ROW LEVEL SECURITY;

-- Helper: is user member of budget? (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_budget_member(_budget uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM shared_budget_members WHERE budget_id = _budget AND user_id = _user)
$$;

-- shared_budgets policies
CREATE POLICY "members can view shared_budgets" ON public.shared_budgets
  FOR SELECT USING (is_budget_member(id, auth.uid()));
CREATE POLICY "auth can create shared_budgets" ON public.shared_budgets
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner can update shared_budgets" ON public.shared_budgets
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "owner can delete shared_budgets" ON public.shared_budgets
  FOR DELETE USING (auth.uid() = owner_id);

-- members policies
CREATE POLICY "members can view members" ON public.shared_budget_members
  FOR SELECT USING (is_budget_member(budget_id, auth.uid()));
CREATE POLICY "users can join as themselves" ON public.shared_budget_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can leave themselves" ON public.shared_budget_members
  FOR DELETE USING (auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM shared_budgets b WHERE b.id = budget_id AND b.owner_id = auth.uid()));

-- transactions policies
CREATE POLICY "members can view shared_transactions" ON public.shared_transactions
  FOR SELECT USING (is_budget_member(budget_id, auth.uid()));
CREATE POLICY "members can add shared_transactions" ON public.shared_transactions
  FOR INSERT WITH CHECK (is_budget_member(budget_id, auth.uid()) AND auth.uid() = added_by);
CREATE POLICY "author can update shared_transactions" ON public.shared_transactions
  FOR UPDATE USING (auth.uid() = added_by);
CREATE POLICY "author or owner can delete shared_transactions" ON public.shared_transactions
  FOR DELETE USING (auth.uid() = added_by
    OR EXISTS (SELECT 1 FROM shared_budgets b WHERE b.id = budget_id AND b.owner_id = auth.uid()));

-- Create budget + auto-add owner as member
CREATE OR REPLACE FUNCTION public.create_shared_budget(_name text, _emoji text DEFAULT '👥', _monthly_limit numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  new_id uuid;
  code text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  INSERT INTO shared_budgets(name, emoji, owner_id, invite_code, monthly_limit)
    VALUES (_name, COALESCE(_emoji, '👥'), uid, code, _monthly_limit)
    RETURNING id INTO new_id;
  INSERT INTO shared_budget_members(budget_id, user_id, role) VALUES (new_id, uid, 'owner');
  RETURN new_id;
END $$;

-- Join by invite code
CREATE OR REPLACE FUNCTION public.join_shared_budget(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  bid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT id INTO bid FROM shared_budgets WHERE invite_code = upper(trim(_code));
  IF bid IS NULL THEN RAISE EXCEPTION 'Бюджет с таким кодом не найден'; END IF;
  INSERT INTO shared_budget_members(budget_id, user_id, role) VALUES (bid, uid, 'member')
    ON CONFLICT DO NOTHING;
  RETURN bid;
END $$;

-- List budgets with totals
CREATE OR REPLACE FUNCTION public.get_my_shared_budgets()
RETURNS TABLE(
  id uuid, name text, emoji text, owner_id uuid, invite_code text, monthly_limit numeric,
  members_count int, balance numeric, month_expense numeric, month_income numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id, b.name, b.emoji, b.owner_id, b.invite_code, b.monthly_limit,
    (SELECT count(*)::int FROM shared_budget_members m WHERE m.budget_id = b.id),
    COALESCE((SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END)
      FROM shared_transactions WHERE budget_id = b.id), 0),
    COALESCE((SELECT SUM(amount) FROM shared_transactions
      WHERE budget_id = b.id AND type='expense'
      AND occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0),
    COALESCE((SELECT SUM(amount) FROM shared_transactions
      WHERE budget_id = b.id AND type='income'
      AND occurred_on >= date_trunc('month', CURRENT_DATE)::date), 0)
  FROM shared_budgets b
  WHERE is_budget_member(b.id, auth.uid())
  ORDER BY b.created_at DESC;
$$;