-- Required weekly overall budget — the headline budgeting concept. One row
-- per Mon-Sun calendar week; the monthly (x4) and daily (/7) figures shown
-- in the UI are always derived, never stored.
create table weekly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null, -- always a Monday
  planned_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start),
  constraint weekly_budgets_planned_amount_positive check (planned_amount > 0)
);

alter table weekly_budgets enable row level security;

create policy "weekly_budgets_select_own" on weekly_budgets for select using (auth.uid() = user_id);
create policy "weekly_budgets_insert_own" on weekly_budgets for insert with check (auth.uid() = user_id);
create policy "weekly_budgets_update_own" on weekly_budgets for update using (auth.uid() = user_id);
create policy "weekly_budgets_delete_own" on weekly_budgets for delete using (auth.uid() = user_id);

-- Recurring constants: taxes/subscriptions/salary that auto-post as real
-- income/expense rows on schedule instead of needing manual re-entry.
create table recurring_constants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0),
  -- Deferrable (not plain restrict) from the start: 0003_defer_child_fk_constraints.sql
  -- exists because plain restrict broke the single-user cascade delete once
  -- already when accounts/categories rows got cascade-deleted before their
  -- referencing child rows in the same transaction. New tables referencing
  -- accounts/categories must never repeat that mistake.
  category_id uuid references categories(id) on delete no action deferrable initially deferred,
  account_id uuid not null references accounts(id) on delete no action deferrable initially deferred,
  source text,
  notes text,
  frequency text not null check (frequency in ('monthly', 'yearly')),
  day_of_month int not null check (day_of_month between 1 and 31),
  month_of_year int check (month_of_year between 1 and 12),
  next_due_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurring_constants_expense_needs_category check (kind <> 'expense' or category_id is not null),
  constraint recurring_constants_income_needs_source check (kind <> 'income' or source is not null),
  constraint recurring_constants_yearly_needs_month check (frequency <> 'yearly' or month_of_year is not null)
);

alter table recurring_constants enable row level security;

create policy "recurring_constants_select_own" on recurring_constants for select using (auth.uid() = user_id);
create policy "recurring_constants_insert_own" on recurring_constants for insert with check (auth.uid() = user_id);
create policy "recurring_constants_update_own" on recurring_constants for update using (auth.uid() = user_id);
create policy "recurring_constants_delete_own" on recurring_constants for delete using (auth.uid() = user_id);

-- Tags auto-posted rows so Transactions can show an "Auto" badge and a
-- recurring constant's posting history is traceable. Nullable — manual
-- entries never set this. Same deferrable pattern: when the single user is
-- deleted, recurring_constants rows and their referencing income/expenses
-- rows are all cascade-deleted in the same transaction, and ordering
-- between them isn't guaranteed.
alter table income add column recurring_constant_id uuid
  references recurring_constants(id) on delete no action deferrable initially deferred;
alter table expenses add column recurring_constant_id uuid
  references recurring_constants(id) on delete no action deferrable initially deferred;
