# Personal Finance App — Design

**Date:** 2026-08-18
**Status:** Approved for planning

## 1. Purpose

Replace a manually-maintained Google Sheets workbook (`Budgeting Metrics (1).xlsx`) with a mobile-installable web app for tracking personal income, expenses, category budgets, account balances, and a stock portfolio. Solo-user project (Ferdinand only). Long-term goal: usable day-to-day from a phone, ideally installed like a native app.

### Source data analyzed

The reference workbook contains, per month (Sept 2025 – Aug 2026, 12 monthly tabs):
- An **income log** (source, date, amount, account, notes)
- A **category budget table** (category, planned, actual, difference, notes) — actual/difference are currently hand-computed
- A **transaction-level expense log** (description, date, cost, account, notes)
- Manually re-counted **account balance snapshots** (Cash, Gcash, Savings) at month start/end
- A **6-Month Summary** tab: income/expense/variance rollup by month, category breakdown by month, and hand-written insights (highest spend month, biggest category, etc.)
- A **Portfolio** tab: stock buy/sell transactions (company, ticker, type, peso amount) and a separate deposit/withdrawal ledger for the investment account cash balance. No share counts or live prices are tracked — only pesos committed per stock.

Two additional tabs (`her.`, `Date Plans / Drafts / Ideas`) contain personal/relationship planning content, unrelated to finance. **Explicitly out of scope** for this app.

## 2. Architecture

```
Phone (Android/iPhone) → installs Next.js PWA to home screen
        │
        ▼
Next.js app (React + TypeScript)
  - UI screens, forms, charts (Recharts)
  - Talks to Supabase via client SDK
  - API routes for anything server-only (e.g. one-time migration script)
        │
        ▼
Supabase (managed Postgres)
  - Auth: single user, email/password
  - Database: all budgeting + portfolio data
  - Row-Level Security: only the authenticated user can read/write their rows
        │
        ▼
Hosted on Vercel (free tier) — HTTPS, reachable from the phone anywhere
```

**Why this stack:** one codebase covers both Android and iPhone via an installable PWA (no separate native builds), Supabase removes the need to hand-roll auth/backend, and everything fits on free tiers appropriate for a solo hobby project. The same UI can later be wrapped in a native shell (e.g. Capacitor) if app-store distribution is ever wanted — not needed for v1.

Data entry happens directly in the app going forward (not in Google Sheets). The spreadsheet is used only once, as historical seed data (see §5).

## 3. Data model

| Table | Fields | Notes |
|---|---|---|
| `accounts` | id, name, created_at | Seeded: Cash, Gcash, Maribank, Savings/Debit Card. User-editable — can add/archive more later. |
| `categories` | id, name, archived, created_at | Seeded from categories found in the historical data (Coffee, Food, Parking, Errands, etc. — see §5). User can add/archive. |
| `income` | id, date, amount, source (text), account_id, notes, created_at | |
| `expenses` | id, date, amount, category_id, account_id, notes, created_at | |
| `budgets` | id, month, category_id, planned_amount | One row per (month, category). Actual and difference are **computed** at query time by summing `expenses` for that month+category — not stored, so they can never drift out of sync like in the spreadsheet. |
| `portfolio_transactions` | id, date, type (`buy`\|`sell`\|`deposit`\|`withdraw`), company, ticker, amount, notes | Buy/sell rows track a stock position; deposit/withdraw rows track the investment account's cash balance. Holdings (total invested per stock) are computed by summing buy/sell rows per ticker — no separate holdings table. |

**Account balances** (Cash/Gcash/Maribank/Savings) are computed automatically as a running sum of `income` and `expenses` against that account — not manually re-counted and re-entered each month like the spreadsheet requires. If the counted real-world balance ever drifts from the computed one, the user logs a **balance adjustment** (a signed income/expense entry with a dedicated note/flag) to reconcile — a single line instead of a full manual snapshot block.

**Portfolio value** is tracked as **cost basis only** for v1 (money invested per stock, no live share prices or market value) — matching what the spreadsheet already does. Live PSE price integration is out of scope (see §7).

## 4. Screens (MVP)

1. **Login** — email/password, single user, no sign-up flow (account created directly in Supabase during setup).
2. **Dashboard** — current month: total income, planned vs. actual, variance, account balances, spend-by-category chart.
3. **Add Income / Add Expense** — fast mobile-friendly entry forms; the primary daily-use screens.
4. **Transactions** — searchable/filterable feed of all income + expenses, edit/delete, filter by month/category/account.
5. **Budget** — current month's categories with planned vs. actual vs. difference; edit planned amounts per category.
6. **Trends** — multi-month view equivalent to the 6-Month Summary tab: income/expense/variance by month, category breakdown over time.
7. **Portfolio** — stock buy/sell log, investment account deposit/withdrawal log, total invested per stock and overall.
8. **Accounts** — Cash/Gcash/Maribank/Savings balances, with the balance-adjustment reconciliation action.

## 5. Historical migration

A one-time Node script (run manually against the real Supabase database once it exists, not part of the running app) parses `Budgeting Metrics (1).xlsx` and loads:

- Each month's income rows → `income`
- Each month's transaction-level expense rows → `expenses` (category inferred from the matching "Monthly Expenses" row in that month's budgeting-metrics block)
- Each month's planned amounts → `budgets`
- Portfolio buy/sell and deposit/withdrawal rows → `portfolio_transactions`

Rows that are placeholders (e.g. `Pending` entries with no real data in the Portfolio tab) are skipped. After import, the script prints per-month totals so they can be checked against the spreadsheet's own "Total Income" / "Total for this month" cells before the spreadsheet is retired.

## 6. Non-functional requirements

- **PWA installability** — web app manifest + service worker so "Add to Home Screen" produces a real icon and splash screen, with an offline-cached UI shell (new data still requires connectivity to save).
- **Auth** — Supabase email/password, single account, protected by Row-Level Security so only that account's rows are ever returned.
- **Testing** — unit tests on the money math (budget variance, account balance aggregation, portfolio cost-basis totals), since correctness there matters most; manual verification of each screen in a real browser before considering a phase done.

## 7. Explicitly out of scope (for now)

- Live PSE stock prices / unrealized gain-loss
- The `her.` and `Date Plans / Drafts / Ideas` tabs (relationship planning — unrelated to finance)
- Multi-user support or sharing
- Native app-store builds (App Store / Play Store) — the PWA covers "runs on my phone" for v1

## 8. Suggested build order

1. Project scaffold (Next.js + Supabase + Vercel deploy pipeline), auth, PWA shell
2. Core data model + Accounts/Categories admin
3. Income/Expense entry + Transactions list
4. Budget screen (planned vs. computed actual)
5. Dashboard + Trends charts
6. Historical migration script, run once against real data
7. Portfolio screens
