-- The single auth user's deletion cascades (on delete cascade from auth.users)
-- to accounts, categories, income, expenses, budgets, and portfolio_transactions
-- all in one transaction. income.account_id, expenses.account_id,
-- expenses.category_id, and budgets.category_id were declared `on delete restrict`,
-- and RESTRICT is checked immediately (not deferrable) — so if accounts/categories
-- rows are cascade-deleted before income/expenses/budgets rows in the same
-- transaction, the whole cascade fails with a foreign key violation.
--
-- Fix: switch these four FKs to NO ACTION DEFERRABLE INITIALLY DEFERRED. Unlike
-- RESTRICT, NO ACTION can be deferred, so the check runs at commit time — after
-- the cascade has already cleared the referencing child rows. This preserves
-- "can't delete an account/category that's still referenced" for ordinary
-- single-statement deletes, while letting a full user-deletion cascade succeed.

alter table income drop constraint if exists income_account_id_fkey;
alter table income add constraint income_account_id_fkey
  foreign key (account_id) references accounts(id) on delete no action deferrable initially deferred;

alter table expenses drop constraint if exists expenses_account_id_fkey;
alter table expenses add constraint expenses_account_id_fkey
  foreign key (account_id) references accounts(id) on delete no action deferrable initially deferred;

alter table expenses drop constraint if exists expenses_category_id_fkey;
alter table expenses add constraint expenses_category_id_fkey
  foreign key (category_id) references categories(id) on delete no action deferrable initially deferred;

alter table budgets drop constraint if exists budgets_category_id_fkey;
alter table budgets add constraint budgets_category_id_fkey
  foreign key (category_id) references categories(id) on delete no action deferrable initially deferred;
