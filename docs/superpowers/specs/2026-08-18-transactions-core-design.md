# Transactions Core — Design

**Date:** 2026-08-18
**Status:** Approved for planning

## 1. Purpose

The foundation plan shipped scaffold, auth, schema, and placeholder "coming
soon" screens for dashboard/transactions/budget/portfolio/accounts. This is
the first of several follow-up sub-projects that build the real UI (see
`docs/superpowers/PROGRESS.md`'s "Product direction for the NEXT plan" for
the full breakdown into: **Transactions core** (this doc) → Budgeting →
Dashboard & Insights → Portfolio → Historical migration).

**Core motivation** (unprompted, from the user, during the foundation plan):
the current Google Sheets tracker doesn't get updated regularly because its
UI doesn't invite daily use. This sub-project targets that problem directly
— fast, low-friction income/expense entry reachable from anywhere in the
app, plus the transactions feed and account/category admin that entry
depends on. Everything else (budgeting, dashboards, portfolio) needs real
transaction data to be meaningful, so this is the prerequisite phase.

## 2. Scope

**In scope:**
- Quick-add entry for income and expenses, reachable from every screen.
- Transactions list: filter, search, edit, delete.
- Accounts & Categories admin screen: balances, archive/unarchive, add new.
- Schema changes needed to support the above, including resolving the
  amount-sign-convention decision deferred from the foundation plan's final
  review.
- Bottom nav polish (sticky, safe-area padding, active-tab indicator),
  bundled in because this phase already touches `app/(app)/layout.tsx` for
  the quick-add FAB.

**Out of scope (separate later sub-projects):**
- Dashboard and Budget screens stay placeholders — they're the next two
  sub-projects in the sequence and depend on this one's schema.
- Portfolio screens stay a placeholder.
- Recurring "constants" (taxes, subscriptions), daily/monthly budgeting,
  income-anchored budgets — these are the Budgeting sub-project.
- Periodic rollup reports, auto-generated insights, per-account/category
  charts — these are the Dashboard & Insights sub-project.
- Historical migration from the real spreadsheet.
- `proxy.ts` matcher redesign and PWA `maskable` icon — unrelated to
  transactions, remain open items with no assigned phase.
- Offline entry queueing — the PWA shell stays cached, but new data still
  requires connectivity to save (matches the foundation plan's existing
  non-functional requirement).

## 3. Data model changes

New migration, `supabase/migrations/0004_transactions_core.sql`:

- **Amount sign convention**, resolved: always positive, direction implied
  by context (which table for income/expenses, `type` for portfolio
  transactions). Add `check (amount > 0)` to `income.amount`,
  `expenses.amount`, `budgets.planned_amount`, and
  `portfolio_transactions.amount`. All four are resolved in this one
  migration even though budgets/portfolio UI comes in later phases — it's
  the same deferred decision, cheap to close now, and expensive to
  reconcile once real data exists in those columns too.
- **`accounts.archived boolean not null default false`** — added for
  symmetry with `categories.archived`. Both tables are `on delete
  restrict`-protected by their transaction history, so without this an
  account could never be hidden from active use.
- **Balance-adjustment flag** — `income.is_adjustment boolean not null
  default false` and `expenses.is_adjustment boolean not null default
  false`. Reconciling a computed balance against a real counted balance
  (the spreadsheet's manual "Current Capital" process) is just a normal
  income or expense row with this flag set — it stays in the unified
  transactions feed, labeled distinctly, rather than needing a separate
  table or screen.
- **`expenses.category_id` becomes nullable**, with `check (is_adjustment
  or category_id is not null)` — a balance adjustment isn't "spending" in a
  category. This flag is also what the Budgeting phase's actual-spend sums
  will filter on.

No existing tables are restructured — this is additive columns and
constraints only.

## 4. Screens & UX

### Quick-add sheet

A floating "+" lives in `app/(app)/layout.tsx`, reachable from every
screen. Opens a bottom sheet (client component) with:

- Income/Expense toggle.
- Amount, date (defaults to today), optional notes.
- Account picker, pre-filled with whichever account was used on the most
  recent transaction — derived server-side from the latest row, not local
  device state, so it works identically on a fresh install or a second
  device.
- Expense only: category picker, with the most-used categories surfaced as
  one-tap chips above the full list.
- A "balance adjustment" toggle for reconciliation entries — sets
  `is_adjustment` and hides the category picker when on.

Submits via a Server Action, following the existing pattern already used
for login/logout (`app/login/actions.ts`, `app/(app)/actions.ts`) — no new
routing concepts, no new dependencies. The same sheet, pre-filled, is
reused for editing (tap a row in the Transactions list), with a delete
action added.

On a failed submit (e.g. lost connectivity), the sheet keeps whatever was
typed and shows a retry-able inline error rather than clearing the form —
no offline queueing, but no silent data loss either.

**Alternative considered:** a Next.js intercepting/parallel-route modal
(its own URL, survives refresh, native back-button support). Rejected —
meaningfully more routing complexity for polish unlikely to be noticed in
a solo-user app, and awkward to share cleanly between add and edit.

### Transactions list (`app/(app)/transactions/page.tsx`)

- Defaults to the current month, newest first — matches how the user
  already thinks about the data (one sheet tab per month).
- Filters: month, account, category, type (income/expense); text search
  over notes/source/description.
- Adjustment entries are visually distinguished (e.g. a small badge) so
  they don't read as ordinary spending.
- Tapping a row opens the quick-add sheet pre-filled for editing.

### Accounts & Categories screen (`app/(app)/accounts/page.tsx`)

Renamed in-nav to reflect both admin lists living here — they're both
low-frequency admin tasks that don't warrant a whole extra nav item.

- Each account shows its computed balance: running sum of that account's
  income minus expenses (adjustments included, since they're real
  corrections to the running total).
- Archive/unarchive per account and per category — archived items drop out
  of the quick-add pickers but stay attached to their historical
  transactions (required by the existing `on delete restrict` FKs).
- Add new account / add new category — simple name-only forms.

### Bottom nav polish

Bundled into this phase since `app/(app)/layout.tsx` is already being
touched for the FAB. Closes three items deferred from the foundation
plan's final review:
- `sticky bottom-0` positioning (currently plain flow, scrolls away on a
  long page).
- iOS safe-area padding (`pb-[env(safe-area-inset-bottom)]`).
- Active-tab indicator (`aria-current="page"` / highlighted state).

## 5. Testing

**Unit tests** (money-math correctness matters most, per the existing
non-functional requirements):
- Account balance computation (sum of income − expenses per account,
  adjustments included, archived accounts still summed correctly since
  their history must stay accurate).
- "Most-recently-used account" derivation.
- Most-used category ranking for the quick-add chips.

**Manual verification**, in the real browser preview once built: add
income, add expense, add adjustment, edit, delete, transactions
filters/search, archive/unarchive an account and a category, and the nav
polish checked at mobile viewport size.

## 6. Error handling

- Server Action validates amount > 0 and category-required-unless-
  adjustment client-side, so failures surface as a friendly inline message
  rather than a raw Postgres constraint error.
- RLS already scopes every row to the single user; no changes needed.

## 7. Sequencing note

This is sub-project 1 of 5 in the "next plan" breakdown from
`docs/superpowers/PROGRESS.md`:

1. **Transactions core** (this doc)
2. Budgeting — daily + monthly granularity, income-anchored budgets,
   recurring "constants" (taxes, subscriptions)
3. Dashboard & Insights — glanceable dashboard, periodic rollup reports
   (3/6/9/12-month), auto-generated insights panel, per-account and
   per-category charts
4. Portfolio — buy/sell/deposit/withdraw log, cost-basis totals
5. Historical migration — one-time import of the real spreadsheet, run
   last so it targets a finalized schema

Each sub-project gets its own design → plan → implementation cycle.
