-- Task 11 final-review fix: 0005's FKs from income/expenses back to
-- recurring_constants were declared `on delete no action deferrable
-- initially deferred`, which only protects the same-transaction
-- user-deletion cascade (0003_defer_child_fk_constraints.sql's reason for
-- existing) — it does nothing for a standalone delete of one
-- recurring_constants row with surviving child rows, so the app's own
-- Delete button throws a FK violation for any constant that has ever
-- auto-posted. Switch to `set null` so deleting a constant always
-- succeeds and its past-posted rows survive as ordinary transactions,
-- matching the UI's own promise that history stays untouched.

alter table income drop constraint income_recurring_constant_id_fkey;
alter table income add constraint income_recurring_constant_id_fkey
  foreign key (recurring_constant_id) references recurring_constants(id)
  on delete set null deferrable initially deferred;

alter table expenses drop constraint expenses_recurring_constant_id_fkey;
alter table expenses add constraint expenses_recurring_constant_id_fkey
  foreign key (recurring_constant_id) references recurring_constants(id)
  on delete set null deferrable initially deferred;
