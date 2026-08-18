create table income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(12,2) not null,
  source text not null,
  account_id uuid not null references accounts(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

alter table income enable row level security;

create policy "income_select_own" on income for select using (auth.uid() = user_id);
create policy "income_insert_own" on income for insert with check (auth.uid() = user_id);
create policy "income_update_own" on income for update using (auth.uid() = user_id);
create policy "income_delete_own" on income for delete using (auth.uid() = user_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  amount numeric(12,2) not null,
  category_id uuid not null references categories(id) on delete restrict,
  account_id uuid not null references accounts(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

alter table expenses enable row level security;

create policy "expenses_select_own" on expenses for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on expenses for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on expenses for update using (auth.uid() = user_id);
create policy "expenses_delete_own" on expenses for delete using (auth.uid() = user_id);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null, -- always the 1st of the month, e.g. 2025-09-01
  category_id uuid not null references categories(id) on delete restrict,
  planned_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

alter table budgets enable row level security;

create policy "budgets_select_own" on budgets for select using (auth.uid() = user_id);
create policy "budgets_insert_own" on budgets for insert with check (auth.uid() = user_id);
create policy "budgets_update_own" on budgets for update using (auth.uid() = user_id);
create policy "budgets_delete_own" on budgets for delete using (auth.uid() = user_id);

create table portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_on date not null,
  type text not null check (type in ('buy', 'sell', 'deposit', 'withdraw')),
  company text,
  ticker text,
  amount numeric(12,2) not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table portfolio_transactions enable row level security;

create policy "portfolio_transactions_select_own" on portfolio_transactions for select using (auth.uid() = user_id);
create policy "portfolio_transactions_insert_own" on portfolio_transactions for insert with check (auth.uid() = user_id);
create policy "portfolio_transactions_update_own" on portfolio_transactions for update using (auth.uid() = user_id);
create policy "portfolio_transactions_delete_own" on portfolio_transactions for delete using (auth.uid() = user_id);
