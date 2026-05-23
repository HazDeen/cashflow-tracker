
create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  shift_date date not null,
  amount numeric not null,
  note text,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.work_shifts enable row level security;
create policy "own work_shifts" on public.work_shifts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$ begin
  create type public.debt_direction as enum ('i_owe','owed_to_me');
exception when duplicate_object then null; end $$;

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  counterparty text not null,
  amount numeric not null,
  direction public.debt_direction not null,
  due_date date,
  is_settled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.debts enable row level security;
create policy "own debts" on public.debts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.profiles (
  id uuid primary key,
  telegram_chat_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
