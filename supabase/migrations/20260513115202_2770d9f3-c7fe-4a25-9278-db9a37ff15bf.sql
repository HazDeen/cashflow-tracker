-- Achievements
CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏆',
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own achievements select" ON public.achievements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own achievements insert" ON public.achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own achievements delete" ON public.achievements
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS achievements_user_idx ON public.achievements(user_id);

-- Streak
CREATE OR REPLACE FUNCTION public.get_user_streak(p_user uuid DEFAULT auth.uid())
RETURNS TABLE(current_streak int, longest_streak int, total_days int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date;
  prev date;
  cur int := 0;
  longest int := 0;
  running int := 0;
  total int := 0;
  today_streak int := 0;
  has_today boolean := false;
  has_yesterday boolean := false;
BEGIN
  FOR d IN
    SELECT DISTINCT occurred_on FROM transactions WHERE user_id = p_user ORDER BY occurred_on
  LOOP
    total := total + 1;
    IF prev IS NULL OR d = prev + 1 THEN
      running := running + 1;
    ELSE
      running := 1;
    END IF;
    IF running > longest THEN longest := running; END IF;
    prev := d;
  END LOOP;

  SELECT EXISTS(SELECT 1 FROM transactions WHERE user_id=p_user AND occurred_on = CURRENT_DATE) INTO has_today;
  SELECT EXISTS(SELECT 1 FROM transactions WHERE user_id=p_user AND occurred_on = CURRENT_DATE - 1) INTO has_yesterday;

  IF has_today OR has_yesterday THEN
    cur := running;
  ELSE
    cur := 0;
  END IF;

  RETURN QUERY SELECT cur, longest, total;
END $$;

-- Evaluate and grant achievements
CREATE OR REPLACE FUNCTION public.evaluate_achievements(p_user uuid DEFAULT auth.uid())
RETURNS SETOF public.achievements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_count int;
  v_streak int;
  v_longest int;
  v_goals_done int;
  v_debts_settled int;
  v_balance numeric;
  v_savings numeric;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT count(*) INTO v_tx_count FROM transactions WHERE user_id = p_user;
  SELECT current_streak, longest_streak INTO v_streak, v_longest FROM get_user_streak(p_user);
  SELECT count(*) INTO v_goals_done FROM savings_goals WHERE user_id=p_user AND current_amount >= target_amount;
  SELECT count(*) INTO v_debts_settled FROM debts WHERE user_id=p_user AND is_settled = true;
  SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) INTO v_balance
    FROM transactions WHERE user_id=p_user;
  SELECT COALESCE(SUM(current_amount),0) INTO v_savings FROM savings_goals WHERE user_id=p_user;

  -- Helper inline grants
  IF v_tx_count >= 1 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'first_step', 'Первый шаг', 'Записал первую операцию', '🚀')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_tx_count >= 50 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'tx_50', 'Бухгалтер', '50 операций в копилке', '📒')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_tx_count >= 200 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'tx_200', 'Финансовый гуру', '200 операций', '🧮')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_streak >= 7 OR v_longest >= 7 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'streak_7', 'Неделя подряд', '7 дней подряд с записями', '🔥')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_streak >= 30 OR v_longest >= 30 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'streak_30', 'Месяц дисциплины', '30 дней подряд', '💎')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_goals_done >= 1 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'goal_done', 'Цель достигнута', 'Закрыта первая цель', '🎯')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_debts_settled >= 1 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'debt_free', 'Долг закрыт', 'Закрыт первый долг', '✅')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_savings >= 100000 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'saver_100k', 'Накопитель', 'Накопил 100 000 ₽ в целях', '🏦')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_balance >= 500000 THEN
    INSERT INTO achievements(user_id, code, title, description, icon)
    VALUES(p_user, 'balance_500k', 'Капиталист', 'Баланс 500 000 ₽', '💰')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT * FROM achievements WHERE user_id = p_user ORDER BY unlocked_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_gamification(p_user uuid DEFAULT auth.uid())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_streak record;
  v_achievements jsonb;
BEGIN
  SELECT * INTO v_streak FROM get_user_streak(p_user);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', code, 'title', title, 'description', description,
    'icon', icon, 'unlocked_at', unlocked_at) ORDER BY unlocked_at DESC), '[]'::jsonb)
    INTO v_achievements FROM achievements WHERE user_id = p_user;
  RETURN jsonb_build_object(
    'current_streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'total_days', v_streak.total_days,
    'achievements', v_achievements
  );
END $$;