# Budgeting — Design

**Date:** 2026-08-20
**Status:** Approved for planning

## 1. Purpose

Sub-project 2 of 5 (see `docs/superpowers/PROGRESS.md`). Replaces the
still-stub `/budget` screen with the app's most-used screen: a **required
weekly overall budget**, an **optional per-category monthly budget** table
(the original v1 design, unchanged), and **recurring constants** (taxes,
subscriptions, salary) that auto-post as real transactions on schedule.
Guiding goal for this whole app, restated by the user while approving this
spec: make entering/tracking money **more intuitive than the source
spreadsheet**, not just a digital copy of it.

## 2. Scope

In scope: weekly budget (input, derived monthly/daily, income-anchor
leftover/warning, advance-setting future weeks, missed-week reminder
banner), optional per-category monthly budgets, recurring constants
(setup, catch-up auto-posting, pause/edit/delete), one new Dashboard
insight. Out of scope: see §10.

## 3. Data model changes

New migration, `supabase/migrations/0005_budgeting.sql`:

- **`weekly_budgets`**: `id, user_id, week_start (date, always a Monday),
  planned_amount (numeric(12,2), > 0), created_at`. Unique on
  `(user_id, week_start)`. Same RLS pattern as every other table (four
  owner-only policies), same `on delete no action deferrable initially
  deferred` FK-to-`auth.users` pattern used elsewhere isn't needed here
  (no child tables reference it).
- **`budgets`** (existing, category+month): **unchanged**. Still optional,
  still consumed as-is by the existing Dashboard insights.
- **`recurring_constants`**: `id, user_id, kind ('expense'|'income'),
  amount (numeric(12,2), > 0), category_id (nullable, references
  categories, expense only), account_id (references accounts), source
  (nullable text, income only — mirrors `income.source`), notes,
  frequency ('monthly'|'yearly'), day_of_month (int, 1–31), month_of_year
  (nullable int, 1–12, yearly only), next_due_on (date), active (boolean,
  default true), created_at`. Check constraint: `kind = 'expense'` implies
  `category_id is not null`; `kind = 'income'` implies `source is not
  null`. Its `category_id`/`account_id` FKs use the same `on delete no
  action deferrable initially deferred` pattern from
  `0003_defer_child_fk_constraints.sql` from the start (not `restrict`) —
  that migration exists because plain `restrict` broke the single-user
  cascade delete once already; new tables referencing accounts/categories
  should never repeat that. Monthly/yearly due-date advancement clamps to
  the month's last day when `day_of_month` doesn't exist in the target
  month (e.g. 31 in February → Feb 28/29).
- **`income.recurring_constant_id`** and **`expenses.recurring_constant_id`**:
  new nullable FK columns, `references recurring_constants(id) on delete
  no action deferrable initially deferred` (matches the existing
  `0003_defer_child_fk_constraints.sql` pattern, so deleting the single
  auth user still cascades cleanly). Tags auto-posted rows for the
  Transactions "Auto" badge and for recurring-constant posting history.

## 4. Weekly budget UX

The Budget screen's headline card. A week navigator (◀/▶) moves between
weeks; past weeks are read-only, future weeks can be pre-set in advance.
A week with nothing set shows an inline "Set this week's budget" input
instead of a number.

- **Big number**: current week's planned amount, spent-so-far, and
  remaining — largest type on the screen, matching the "highlight the
  weekly number" requirement.
- **Derived stats** (smaller, clearly labeled as projections, not
  separate inputs): monthly = current week's planned amount × 4; daily =
  current week's planned amount ÷ 7.
- **Income-anchor line**: "Income this week: ₱X · Leftover after budget:
  ₱Y", always visible; Y negative (budgeted more than logged income for
  that week) gets a warning treatment — visual flag only, never blocking.
- **Reminder banner**: shown when today is within 2 days of the current
  week's end and next week has no `weekly_budgets` row yet — "Set your
  budget for the week of Aug 25–31", tapping it jumps straight to setting
  it. In-app only for this sub-project (see §10 on push notifications).

Weeks are Monday–Sunday (ISO calendar week), independent of month
boundaries — a week can span two months.

## 5. Per-category monthly budgets (optional)

A collapsed-by-default secondary section below the weekly headline — it
must not compete visually with the weekly number. One row per category
that has a planned amount set: planned / actual (summed from `expenses`
that month, computed at query time, never stored) / difference — same
model the spreadsheet used, minus the manual arithmetic. Categories with
no planned amount don't appear; an "add a category budget" action opts
one in. No changes to the existing `budgets` table or its query shape.

## 6. Recurring constants

Its own section on the Budget screen: a list of active constants (label
from `notes`, amount, frequency, next due date) with add / edit / pause /
delete. Setup form: expense or income, amount, category (expense) or
source label (income), account, frequency (monthly/yearly), due day (+
month, if yearly).

**Initial `next_due_on`**: computed at creation time from `day_of_month`
(+ `month_of_year` if yearly) relative to today — if this period's due
date hasn't passed yet, `next_due_on` is that date; if it already has,
`next_due_on` skips to the next period. Creating a constant never
back-posts for a due date that passed before the constant existed.

**Catch-up mechanism**: `app/(app)/layout.tsx` already runs on every
authenticated page load (it's where accounts/categories/recent-usage are
fetched today for quick-add). The catch-up check is added there: find
every active `recurring_constants` row with `next_due_on <= today`, post
the corresponding `income`/`expenses` row tagged with
`recurring_constant_id` and dated to `next_due_on` (not to today, so a
skipped day or two doesn't shift the transaction date), then advance
`next_due_on` to the next occurrence. Implemented as a single guarded
`UPDATE ... WHERE next_due_on <= today RETURNING *` claim-then-post
sequence so opening two tabs at once can't double-post the same
occurrence.

Editing a constant only affects future occurrences — already-posted rows
are ordinary `income`/`expenses` rows at that point, editable/deletable
individually like any manual entry. Pausing (`active = false`) or
deleting stops future posts without touching history.

## 7. Dashboard integration

The existing `budgetPace`/`monthsUnderBudget` insights
(`lib/insights.ts`) are unchanged — still driven by the optional
per-category `budgets` table. One new insight, `weekly-budget-pace`
(same "independently omittable when there's no data" pattern as the
other five), so the Dashboard reflects the budget concept people will
actually use even if per-category budgets stay empty. No other Dashboard
changes.

## 8. Component/file structure

- `app/(app)/budget/page.tsx` — rewritten (currently a stub).
- `app/(app)/budget/WeeklyBudgetCard.tsx`, `CategoryBudgetTable.tsx`,
  `RecurringConstantsList.tsx`, `RecurringConstantForm.tsx` — new.
- `lib/weekly-budget.ts` — pure functions: Monday-anchoring, ×4/÷7
  derivation, leftover/warning calc. New, unit-tested.
- `lib/recurring.ts` — pure functions: next-due-date advancement
  (monthly/yearly, day clamping). New, unit-tested.
- `app/(app)/layout.tsx` — extended with the catch-up query/mutation.
- `lib/insights.ts` — add the `weekly-budget-pace` rule.
- `supabase/migrations/0005_budgeting.sql` — new.

## 9. Testing

Unit tests (`lib/*.test.ts`, matching existing convention): Monday-anchor
week-start calculation, ×4/÷7 derivation, leftover/warning sign handling,
recurring due-date advancement including day-of-month clamping and both
frequencies, and the new `weekly-budget-pace` insight rule. Manual
verification in a real browser once built, including checking the
catch-up posts land on the correct historical date (not today's date) and
the reminder banner's 2-day window.

## 10. Explicitly out of scope

- **Real push notifications** for the reminder — deferred to a future
  sub-project; in-app banner only for now (user's explicit call after
  weighing the added infra: VAPID keys, subscription table, permission
  UI, a Vercel Cron job).
- **Per-category weekly budgets** — categories stay monthly; only the
  overall budget is weekly.
- **Retroactive edits** to already-posted recurring rows — edits only
  ever change future occurrences.
- Portfolio (sub-project 4) and historical migration (sub-project 5) —
  untouched here, unaffected by this schema.

## 11. Sequencing note

Sub-project 2 of 5. Follows Transactions core and Dashboard & Insights
(both shipped); precedes Portfolio and Historical migration. The
Dashboard's `weekly-budget-pace` insight (§7) starts rendering once this
ships — no rework needed there beyond adding the one rule.
