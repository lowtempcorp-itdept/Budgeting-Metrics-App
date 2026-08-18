-- Resolves the amount-sign-convention decision deferred from the
-- foundation plan's final review: every amount is always positive,
-- direction is implied by context (which table, or `type` for
-- portfolio_transactions).
alter table income add constraint income_amount_positive check (amount > 0);
alter table expenses add constraint expenses_amount_positive check (amount > 0);
alter table budgets add constraint budgets_planned_amount_positive check (planned_amount > 0);
alter table portfolio_transactions add constraint portfolio_transactions_amount_positive check (amount > 0);

-- Added for symmetry with categories.archived, so accounts can be hidden
-- from active use without breaking the on-delete-restrict history.
alter table accounts add column archived boolean not null default false;

-- A balance-adjustment entry (reconciling a counted balance against the
-- computed one) is just a normal income/expense row with this flag set —
-- it stays in the unified transactions feed instead of needing a
-- separate table.
alter table income add column is_adjustment boolean not null default false;
alter table expenses add column is_adjustment boolean not null default false;

-- A balance adjustment isn't "spending" in a category.
alter table expenses alter column category_id drop not null;
alter table expenses add constraint expenses_category_required_unless_adjustment
  check (is_adjustment or category_id is not null);
