# Dashboard & Insights — Design

**Date:** 2026-08-19
**Status:** Approved for planning

## 1. Purpose

Sub-project 3 of 5 in the post-foundation UI sequence (see
`docs/superpowers/PROGRESS.md`), built out of order — Budgeting is
technically next, but this got an early visual exploration pass while the
idea was fresh, and that exploration is now a settled direction.

**Core motivation** (same one driving every sub-project): the current
Google Sheets tracker doesn't get updated regularly because its UI doesn't
invite daily use. Transactions core solved the *entry* side of that. This
sub-project solves the *reading* side — the numbers need to feel alive and
worth checking, not like a static spreadsheet tab. Same underlying data
(no schema changes — see §3), better presentation.

Two full visual directions ("Passbook" — warm ledger/journal, "Wallet" —
dark fintech-app) were mocked up in a prior session as a Claude Artifact.
This design is the settled result of a follow-up brainstorm that blended
them, worked through with a live visual companion (mockups iterated in a
real browser tab, not just described) — palette, layout, motion, and one
real integration seam (the app shell) were all validated against actual
rendered/interactive HTML before being written down here.

## 2. Scope

**In scope:**
- The dashboard page itself (`app/(app)/dashboard/page.tsx`, currently a
  placeholder), replacing "Dashboard — coming soon."
- Auto-generated insights ("What stood out"), a fixed set of 5 rule types
  (§7).
- A Portfolio summary card (net money moved per ticker) — glance-only.
- A 3/6/9/12-month selector for the trend chart.
- Dark-mode-only styling for this page, plus making the shared header/
  bottom-nav chrome dark specifically when Home is the active tab.
- The motion system (hover-grow, press-shrink, count-up, staggered
  entrance) as reusable primitives, first applied here.

**Out of scope (separate later sub-projects, or explicitly deferred):**
- Full portfolio transaction management (add/edit buys, sells, deposits,
  withdrawals) — stays sub-project 4 (Portfolio). This dashboard only
  *reads* `portfolio_transactions`.
- The Budgeting screens themselves (creating/editing budget rows) — stays
  sub-project 2. This dashboard only *reads* `budgets` for one insight
  rule and the "% of budget used" KPI; if no budget rows exist yet (true
  today, live), those figures gracefully omit rather than showing ₱0 or
  crashing (§9).
- Light mode for this page, and dark styling for the rest of the app
  (Transactions/Budget/Portfolio/Accounts stay plain light Tailwind, as
  today) — a known, accepted visual seam for now.
- Historical migration from the real spreadsheet — sub-project 5.
- Per-account and per-category drill-down detail views — this is the
  glanceable summary; deeper filtering already exists on the Transactions
  page.

## 3. Data model changes

**None.** Every table this page reads already exists: `accounts`,
`categories`, `income`, `expenses`, `budgets`, `portfolio_transactions`.
This sub-project is read-only against all of them (quick-add, already
shipped, remains the only write path). Consistent with the project's
existing philosophy — balances and now insights are computed from
transactions each time, never stored.

## 4. Visual language & palette

Blue becomes the primary/brand accent app-wide going forward (starting
here); amber is the secondary accent. **Green and red are reserved for
income/expense polarity everywhere and are never repurposed for brand or
category color** — validated explicitly in the companion by checking a
mocked category chip and transaction amounts side by side.

Resolved color values (dark mode, the only mode this page ships):

| Token | Value | Use |
|---|---|---|
| `--blue` | `#3f5da3` (glow), `#9cbaf0` (foreground/figures) | brand, primary account/category color |
| `--amber` | `#b9791f` (glow), `#f0b854` (foreground) | secondary accent |
| `--pos` | `#6cd3a5` | income, positive net |
| `--neg` | `#ed8264` | expenses, negative net |
| `--ground` | `linear-gradient(160deg, #0a0d12 0%, #0e1015 50%, #120e0a 100%)` | page base |

**Background:** a full-bleed two-tone radial glow — blue upper-left,
amber lower-right — over the near-black linear base above, not a flat
single-tone dark background:

```css
background:
  radial-gradient(160% 110% at 8% -15%, var(--blue) 0%, transparent 60%),
  radial-gradient(140% 100% at 108% 118%, var(--amber) 0%, transparent 58%),
  var(--ground);
```

**Panels** ("glassy," not opaque sheets) sit on top of that glow so the
color reads through the whole page: `background: rgba(255,255,255,0.045)`,
`border: 1px solid rgba(255,255,255,0.09)`, `border-radius: 16px`.

**Typography** carries forward from the original approved Passbook
direction (its identity was explicitly requested, not just its
structure): Fraunces (serif, headlines and the hero figure), Work Sans
(body), IBM Plex Mono (all numeric values), loaded via `next/font/google`
— self-hosted and subset by Next.js, not the base64-embedded webfonts the
standalone artifact used (that was an artifact-hosting constraint, not a
design requirement).

## 5. Layout

Single scrolling page, top to bottom:

1. **Masthead** — ledger-style header. Personalized name line derived
   from the authenticated user (`user_metadata.full_name`, falling back
   to a generic "Your Ledger" if unset — not hardcoded, even though this
   is a single-user app), plus "This month, at a glance." Date on the
   right (`Day N of 31` style, using the existing `lib/date.ts` Manila
   helpers).
2. **Hero** — big total-balance figure (all accounts, all-time computed
   balance, unaffected by the trend selector) plus a 3-column KPI row:
   Income / Expenses / Net, all **month-to-date**, matching the existing
   Transactions page's sense of "the current month." "% of budget used"
   appears under Expenses only if a budget total exists for the current
   month (§9).
3. **"What stood out"** — the insights panel, margin-note style (serif
   mark, not an icon, per row) — see §7.
4. **By account** — Wallet-style horizontal scrollable cards (this
   replaces Passbook's donut chart entirely, per the settled blend), one
   per non-archived account, computed balance, all-time.
5. **Portfolio** — ledger-row list (Passbook style, kept from the base
   layout — this section wasn't part of the "use Wallet's cards" ask),
   net money moved per ticker/company, all-time. Explicit note in the UI
   ("money moved, not live value") since no price/share data exists.
6. **By category** — horizontal bar list (Passbook style), **month-to-
   date**, top categories by expense total plus an "Other (N)" bucket,
   same shape as both original mockups. Bar fill uses blue (not green —
   green stays reserved for income) since this is a neutral distribution,
   not a positive/negative judgment.
7. **Six-month trend** *(default; selectable)* — filled area under the
   income line, plain line for expenses, hover crosshair showing both
   values for the nearest month. Driven by a period selector next to the
   section header — pill-style trigger ("6 months ▾"), 3/6/9/12 options,
   changes the URL search param (`?months=6`) and re-renders server-side,
   same mechanism the Transactions page already uses for its month
   filter. Same pill component doubles as the interaction proof-of-concept
   for hover-grow on a non-card element (§6).

**Shell chrome:** the shared header and bottom nav (`app/(app)/layout.tsx`)
go dark specifically when `/dashboard` is the active route, via a new
client component wrapping them that reads `usePathname()` — the same
pattern `NavLink.tsx` already uses for active-tab detection, not a new
mechanism. Every other route keeps the existing light chrome unchanged.

## 6. Motion system

Four primitives, validated live in the visual companion (not just
described) before being written down:

- **Hover-grow** — any tappable element (account cards, portfolio rows,
  the period-selector pill) scales to ~1.06–1.08 on hover with a spring-
  ish easing (`cubic-bezier(.34,1.56,.64,1)`, ~140ms).
- **Press-shrink** — the same elements scale down to ~0.94 on
  `:active`/touch-press, ~60ms — the touch equivalent of hover-grow,
  since hover doesn't exist on the phone this app is primarily used on.
- **Count-up** — the hero total and the three KPI figures animate from 0
  to their value (~900ms, ease-out-cubic) on initial load and whenever the
  trend period or month changes. Needs a small client component
  (`requestAnimationFrame`-driven), reusable wherever a large numeric
  figure appears later (Budgeting, Portfolio).
- **Staggered entrance** — the masthead, hero, insights, accounts,
  portfolio, and category sections fade + slide in (~480ms,
  ease-out-expo) with a ~70ms stagger between them on page load.

Hover-grow and press-shrink are plain Tailwind utilities
(`transition-transform duration-150 hover:scale-105 active:scale-95` with
an arbitrary-easing class) — no custom CSS needed. Count-up and staggered
entrance need a small amount of hand-written CSS (`globals.css` keyframe)
and a tiny client component respectively, detailed in the implementation
plan.

## 7. Insights engine

New `lib/insights.ts` (pure functions, unit-tested — same pattern as
`lib/transactions.ts` and `lib/date.ts`), fed `income`/`expenses` rows for
a **fixed trailing 6-month window**, plus `budgets` and `accounts`. This
window is independent of the trend chart's selectable 3/6/9/12-month
range (§5) — insights are meant to read as a stable "here's what stood
out lately" narrative, not one that changes shape just because the chart
selector moved. Fixed v1 rule set, five types, each independently
computable and independently omittable if its data doesn't exist:

1. **Highest-spend month** — within the 6-month window, the month with
   the largest total expenses, with the single largest transaction in
   that month called out (its `notes` if set, else its category name,
   and amount).
2. **Budget pace** — current month's expenses-so-far vs. a linear
   projection to month-end, compared against the sum of `budgets.
   planned_amount` for the current month. **Omitted entirely if no budget
   rows exist for the current month** (true on the live site today, since
   Budgeting screens don't exist yet) — never shows a fabricated ₱0
   budget.
3. **Top recurring category** — the category with the highest expense
   total in the most months within the 6-month window (ties broken by
   total amount).
4. **Dormant account** — any non-archived account with zero transactions
   in the last 10+ days (independent of the 6-month window — this is
   relative to today), naming the account and exact day count. Omitted if
   every account has recent activity.
5. **Months under budget** — count of months in the 6-month window that
   *have* budget data and came in under it. Omitted if no month in the
   window has budget data at all (not shown as "0 of 6").

**Minimum-content rule:** if fewer than 2 of the 5 insights successfully
compute (very likely today, before any budget data exists), the panel
shows a single generic prompt ("Add more transactions to see insights
here") instead of a sparse, oddly-empty list.

## 8. Component/file structure

```
app/(app)/dashboard/
  page.tsx            Server Component — fetches data, composes sections
  Masthead.tsx
  HeroKpis.tsx         includes count-up client sub-component
  InsightsPanel.tsx
  AccountCardsRow.tsx
  PortfolioSummary.tsx
  CategoryBars.tsx
  TrendChart.tsx       'use client' — pointermove crosshair, filled area
  PeriodSelector.tsx   'use client' — pill dropdown, updates ?months=
app/(app)/
  ShellChrome.tsx      'use client' — wraps header+nav, dark iff pathname === '/dashboard'
lib/
  insights.ts          + insights.test.ts
  portfolio.ts          + portfolio.test.ts   (net-per-ticker calc)
```

`layout.tsx` changes minimally: header/nav markup moves into
`ShellChrome.tsx`, which it now renders instead of the raw JSX.

## 9. Error handling & empty states

The live account currently has no real income/expense history (test data
from Transactions core's manual verification was deleted afterward), so
every computed figure must degrade gracefully on empty data:

- Hero total / KPIs: render ₱0, not `NaN` or a crash, when there are no
  rows.
- `Math.max()` / percentage calculations in the insights engine and
  category bars: guarded against empty arrays (used as the denominator
  only when non-zero).
- Insights panel: the minimum-content rule in §7 covers the realistic
  near-empty state.
- Trend chart: still renders its axes/gridlines with all-zero series
  rather than an empty box, so the chart shape itself doesn't look broken.
- Portfolio section: if there are zero `portfolio_transactions` rows, show
  a short empty note rather than an empty ledger-row list with no
  explanation.

## 10. Testing

**Unit tests** (`lib/insights.test.ts`, `lib/portfolio.test.ts`):
- Each of the 5 insight rules, including the "omit when data's missing"
  behavior (no budget rows, no dormant candidates, etc.) and the
  minimum-content fallback.
- Net-per-ticker portfolio math (buys/deposits in, sells/withdrawals out,
  grouped correctly).
- Trend-window date math (3/6/9/12 months back from "today" in Asia/
  Manila, reusing `lib/date.ts`).

**Manual verification**, in the real browser preview once built: all four
period-selector options, hover-grow and press-shrink on cards/rows/pill,
count-up on load and on period change, staggered entrance, the dark shell
chrome toggling correctly when navigating to/from Home, and the empty-
data state (since that's what the live site will actually show first).

## 11. Sequencing note

Sub-project 3 of 5 (built out of order, ahead of Budgeting):

1. Transactions core — ✅ done, merged to `main`
2. Budgeting — daily + monthly granularity, income-anchored budgets,
   recurring "constants" (taxes, subscriptions)
3. **Dashboard & Insights (this doc)**
4. Portfolio — buy/sell/deposit/withdraw log, cost-basis totals, full
   transaction management (this dashboard only reads the same table)
5. Historical migration — one-time import of the real spreadsheet, run
   last so it targets a finalized schema

This dashboard's Budget-pace and Months-under-budget insights (§7) will
have real data to work with once sub-project 2 ships — no rework needed
here, they simply start rendering instead of being omitted.
