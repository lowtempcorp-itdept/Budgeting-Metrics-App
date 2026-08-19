# Dashboard & Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Dashboard — coming soon" placeholder with the real Home screen: a glanceable ledger-style dashboard with auto-generated insights, account cards, a portfolio summary, category breakdown, and a filled-area income/expense trend chart with a period selector — plus the motion system (hover-grow, press-shrink, count-up, staggered entrance) that gives the whole app its "alive" feel going forward.

**Architecture:** One Server Component (`app/(app)/dashboard/page.tsx`) does a single unbounded fetch of `accounts`, `categories`, `income`, `expenses`, `budgets`, and `portfolio_transactions` (same all-rows pattern `accounts/page.tsx` already uses), then derives every windowed view — month-to-date KPIs, the fixed 6-month insights window, the selectable 3/6/9/12-month trend — via small pure functions, unit-tested independently of the framework. Two client components need real interactivity (`TrendChart` for the hover crosshair, `PeriodSelector` for the dropdown), everything else is server-rendered. The shared header/bottom-nav chrome gains a dark variant that only activates on this route.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS, Supabase (Postgres + RLS), Vitest, `next/font/google`.

This is sub-project 3 of 5 (see `docs/superpowers/specs/2026-08-19-dashboard-insights-design.md` §11 for the full sequence). No schema migration — every table this plan reads already exists.

## Global Constraints

- Next.js App Router + TypeScript only — no plain JavaScript files.
- Tailwind CSS for styling; the page's background/panel/font treatments live as a handful of named classes in `app/globals.css` (§ design spec §4) rather than inline styles repeated across components.
- All money values render via the existing `lib/format.ts` `formatCurrency` — never format currency ad hoc.
- **Green (`#6cd3a5`) and red (`#ed8264`) are reserved for income/expense polarity only.** Blue (`#3f5da3` glow / `#9cbaf0` foreground) is primary/brand, amber (`#b9791f` glow / `#f0b854` foreground) is secondary — never repurpose green/red for brand, category, or ticker color.
- **This page is dark-mode-only.** No `prefers-color-scheme`/light-mode branch for anything under `app/(app)/dashboard/`. The rest of the app (Transactions/Budget/Portfolio/Accounts) stays plain light Tailwind, unchanged.
- **Adjustments (`is_adjustment = true`) count toward account balances, the hero total, KPI income/expense sums, and the trend chart** (they're real money movements) **but are excluded from every "spending behavior" insight** (highest-spend-month, top-recurring-category, budget-pace) since they're corrections, not categorized spending. `months-under-budget` also uses adjustment-excluded expense totals, for the same reason.
- **The insights engine's 6-month window is the 6 most recently *complete* calendar months — it never includes the current, in-progress month.** This is independent of the trend chart's selectable 3/6/9/12-month window, which *does* include the current partial month (labeled with a trailing `*` in the UI, e.g. "Aug*"). Conflating the two windows was flagged as an ambiguity during design review — keep them separate.
- Dates: always via `lib/date.ts`'s Asia/Manila helpers, never a naive server `Date()` — same rule as Transactions core, for the same reason (server runs UTC, Manila is UTC+8).
- No schema changes, no new Supabase policies — every table already has owner-only RLS from prior plans.
- **There is only one Supabase environment — the live production project.** Any manual verification step that reads real data must not mutate it; this plan is entirely read-only against the database (no forms, no inserts), so there's nothing to clean up after manual checks, unlike Transactions core.

---

### Task 1: Date window helper + trend aggregation

**Files:**
- Modify: `lib/date.ts`
- Modify: `lib/date.test.ts`
- Create: `lib/trend.ts`
- Create: `lib/trend.test.ts`

**Interfaces:**
- Consumes: `currentMonthInManila` (existing, `lib/date.ts`).
- Produces:
  - `monthsAgoInManila(n: number, referenceDate?: Date): string` (`lib/date.ts`) — returns the 1st of the Manila calendar month that is `n` months before the current one (`n=0` is the current month). Consumed by Task 2 (insights window) and by this task's own `computeTrend`.
  - `type TrendAmountRow = { occurredOn: string; amount: number }` and `computeTrend(months: number, income: TrendAmountRow[], expenses: TrendAmountRow[], referenceDate?: Date): TrendMonthPoint[]` where `TrendMonthPoint = { month: string; income: number; expense: number }` (`lib/trend.ts`) — consumed by Task 9's dashboard page for the trend chart.

- [ ] **Step 1: Write the failing tests for `monthsAgoInManila`**

Add to `lib/date.test.ts` (append — don't remove the existing `describe` blocks):

```ts
import { monthsAgoInManila } from './date'

describe('monthsAgoInManila', () => {
  it('returns the current month when n is 0', () => {
    const reference = new Date('2026-08-15T02:00:00Z') // Aug 15 in Manila
    expect(monthsAgoInManila(0, reference)).toBe('2026-08-01')
  })

  it('returns a prior month within the same year', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(monthsAgoInManila(3, reference)).toBe('2026-05-01')
  })

  it('rolls back across a year boundary', () => {
    const reference = new Date('2026-02-10T02:00:00Z') // Feb 2026 in Manila
    expect(monthsAgoInManila(3, reference)).toBe('2025-11-01')
  })

  it('rolls back a full year for n=12', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(monthsAgoInManila(12, reference)).toBe('2025-08-01')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `monthsAgoInManila` is not exported from `./date`.

- [ ] **Step 3: Implement `monthsAgoInManila`**

Append to `lib/date.ts`:

```ts
export function monthsAgoInManila(n: number, referenceDate: Date = new Date()): string {
  const [year, month] = currentMonthInManila(referenceDate).split('-').map(Number)
  const totalMonths = year * 12 + (month - 1) - n
  const resultYear = Math.floor(totalMonths / 12)
  const resultMonth = (totalMonths % 12) + 1
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}-01`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `date.test.ts` assertions green (existing 5 plus the 4 new ones).

- [ ] **Step 5: Write the failing tests for `computeTrend`**

Create `lib/trend.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeTrend } from './trend'

describe('computeTrend', () => {
  const reference = new Date('2026-08-15T02:00:00Z') // Aug 2026 in Manila

  it('groups income and expenses by month, oldest to newest, including the current partial month', () => {
    const income = [
      { occurredOn: '2026-06-05', amount: 1000 },
      { occurredOn: '2026-07-10', amount: 2000 },
      { occurredOn: '2026-08-01', amount: 500 },
    ]
    const expenses = [
      { occurredOn: '2026-06-20', amount: 300 },
      { occurredOn: '2026-08-10', amount: 100 },
    ]
    const result = computeTrend(3, income, expenses, reference)
    expect(result).toEqual([
      { month: '2026-06-01', income: 1000, expense: 300 },
      { month: '2026-07-01', income: 2000, expense: 0 },
      { month: '2026-08-01', income: 500, expense: 100 },
    ])
  })

  it('returns zeros for months with no matching rows', () => {
    const result = computeTrend(2, [], [], reference)
    expect(result).toEqual([
      { month: '2026-07-01', income: 0, expense: 0 },
      { month: '2026-08-01', income: 0, expense: 0 },
    ])
  })

  it('ignores rows outside the requested window', () => {
    const income = [{ occurredOn: '2026-01-15', amount: 9999 }]
    const result = computeTrend(1, income, [], reference)
    expect(result).toEqual([{ month: '2026-08-01', income: 0, expense: 0 }])
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/trend.ts` does not exist.

- [ ] **Step 7: Implement `computeTrend`**

Create `lib/trend.ts`:

```ts
import { monthsAgoInManila } from './date'

export type TrendAmountRow = { occurredOn: string; amount: number }

export type TrendMonthPoint = {
  month: string
  income: number
  expense: number
}

export function computeTrend(
  months: number,
  income: TrendAmountRow[],
  expenses: TrendAmountRow[],
  referenceDate: Date = new Date()
): TrendMonthPoint[] {
  const monthKeys: string[] = []
  for (let n = months - 1; n >= 0; n--) monthKeys.push(monthsAgoInManila(n, referenceDate))

  function sumForMonth(rows: TrendAmountRow[], month: string): number {
    const prefix = month.slice(0, 7)
    return rows.filter((row) => row.occurredOn.startsWith(prefix)).reduce((sum, row) => sum + row.amount, 0)
  }

  return monthKeys.map((month) => ({
    month,
    income: sumForMonth(income, month),
    expense: sumForMonth(expenses, month),
  }))
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/date.ts lib/date.test.ts lib/trend.ts lib/trend.test.ts
git commit -m "Add month-window date helper and trend aggregation"
```

---

### Task 2: Insights engine

**Files:**
- Create: `lib/insights.ts`
- Create: `lib/insights.test.ts`

**Interfaces:**
- Consumes: `monthsAgoInManila`, `currentMonthInManila`, `todayInManila` from Task 1/existing `lib/date.ts`.
- Produces (`lib/insights.ts`):
  - `type InsightExpenseRow = { occurredOn: string; amount: number; categoryId: string | null; notes: string | null; isAdjustment: boolean }`
  - `type InsightAccount = { id: string; name: string; archived: boolean; lastActivityOn: string | null }`
  - `type InsightBudgetRow = { month: string; plannedAmount: number }`
  - `type Insight` (discriminated union, 5 variants — see Step 3)
  - `computeInsights(input: { expenses: InsightExpenseRow[]; categoryNames: Record<string, string>; accounts: InsightAccount[]; budgets: InsightBudgetRow[]; referenceDate?: Date }): Insight[]`
  - Consumed by Task 7's `InsightsPanel.tsx` and Task 6's `page.tsx` (which builds the input).

- [ ] **Step 1: Write the failing tests**

Create `lib/insights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeInsights, type InsightExpenseRow, type InsightAccount, type InsightBudgetRow } from './insights'

const reference = new Date('2026-08-19T02:00:00Z') // Aug 19, 2026 in Manila — matches the design spec's worked example

function expense(overrides: Partial<InsightExpenseRow>): InsightExpenseRow {
  return {
    occurredOn: '2026-06-15',
    amount: 100,
    categoryId: 'cat-food',
    notes: null,
    isAdjustment: false,
    ...overrides,
  }
}

const categoryNames = { 'cat-food': 'Food', 'cat-errands': 'Errands' }

describe('computeInsights — highest-spend-month', () => {
  it('picks the complete month (within the last 6) with the largest non-adjustment expense total', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-10', amount: 5000, notes: 'Hotel' }),
      expense({ occurredOn: '2026-06-11', amount: 500 }),
      expense({ occurredOn: '2026-07-05', amount: 1000 }),
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'highest-spend-month')
    expect(found).toEqual({
      kind: 'highest-spend-month',
      month: '2026-06-01',
      monthTotal: 5500,
      topLabel: 'Hotel',
      topAmount: 5000,
    })
  })

  it('falls back to the category name when the top expense has no notes', () => {
    const expenses = [expense({ occurredOn: '2026-06-10', amount: 5000, notes: null, categoryId: 'cat-food' })]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'highest-spend-month')
    expect(found).toMatchObject({ topLabel: 'Food' })
  })

  it('excludes adjustment rows and the current in-progress month', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-10', amount: 9999, isAdjustment: true }),
      expense({ occurredOn: '2026-08-01', amount: 9999 }), // current month, excluded from the window
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'highest-spend-month')).toBeUndefined()
  })

  it('is omitted when there is no expense data in the window', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'highest-spend-month')).toBeUndefined()
  })
})

describe('computeInsights — budget-pace', () => {
  it('reports pacing under budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-10', amount: 1900 })] // day 10 of 19 elapsed, Aug has 31 days
    const budgets: InsightBudgetRow[] = [{ month: '2026-08-01', plannedAmount: 35000 }]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    const found = insights.find((i) => i.kind === 'budget-pace')
    expect(found).toMatchObject({ kind: 'budget-pace', spentSoFar: 1900, budget: 35000 })
    if (found?.kind === 'budget-pace') {
      expect(found.projected).toBeCloseTo((1900 / 19) * 31, 1)
      expect(found.projected).toBeLessThan(found.budget)
    }
  })

  it('reports pacing over budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-05', amount: 30000 })]
    const budgets: InsightBudgetRow[] = [{ month: '2026-08-01', plannedAmount: 35000 }]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    const found = insights.find((i) => i.kind === 'budget-pace')
    if (found?.kind === 'budget-pace') expect(found.projected).toBeGreaterThan(found.budget)
    else throw new Error('expected a budget-pace insight')
  })

  it('is omitted when no budget rows exist for the current month', () => {
    const expenses = [expense({ occurredOn: '2026-08-05', amount: 100 })]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'budget-pace')).toBeUndefined()
  })
})

describe('computeInsights — top-category', () => {
  it('picks the category that topped the most complete months in the window, averaged over the full window', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-01', amount: 500, categoryId: 'cat-food' }),
      expense({ occurredOn: '2026-06-02', amount: 100, categoryId: 'cat-errands' }),
      expense({ occurredOn: '2026-07-01', amount: 500, categoryId: 'cat-food' }),
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'top-category')
    expect(found).toMatchObject({
      kind: 'top-category',
      categoryName: 'Food',
      toppedMonths: 2,
      windowMonths: 6,
      averagePerMonth: 1000 / 6,
    })
  })

  it('is omitted when there is no expense data in the window', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'top-category')).toBeUndefined()
  })
})

describe('computeInsights — dormant-account', () => {
  it('flags a non-archived account inactive for 10+ days', () => {
    const accounts: InsightAccount[] = [
      { id: 'acc-1', name: 'Maribank', archived: false, lastActivityOn: '2026-08-08' }, // 11 days before Aug 19
      { id: 'acc-2', name: 'Cash', archived: false, lastActivityOn: '2026-08-18' },
    ]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toEqual({
      kind: 'dormant-account',
      accountName: 'Maribank',
      daysSinceActivity: 11,
    })
  })

  it('ignores archived accounts and accounts with no activity ever', () => {
    const accounts: InsightAccount[] = [
      { id: 'acc-1', name: 'Old Wallet', archived: true, lastActivityOn: '2026-01-01' },
      { id: 'acc-2', name: 'Brand New', archived: false, lastActivityOn: null },
    ]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toBeUndefined()
  })

  it('is omitted when every active account has activity within 10 days', () => {
    const accounts: InsightAccount[] = [{ id: 'acc-1', name: 'Cash', archived: false, lastActivityOn: '2026-08-18' }]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toBeUndefined()
  })
})

describe('computeInsights — months-under-budget', () => {
  it('counts complete months (with budget data) that came in under budget', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-05', amount: 100 }), // under its 200 budget
      expense({ occurredOn: '2026-07-05', amount: 300 }), // over its 200 budget
    ]
    const budgets: InsightBudgetRow[] = [
      { month: '2026-06-01', plannedAmount: 200 },
      { month: '2026-07-01', plannedAmount: 200 },
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    expect(insights.find((i) => i.kind === 'months-under-budget')).toEqual({
      kind: 'months-under-budget',
      underCount: 1,
      consideredCount: 2,
    })
  })

  it('is omitted when no month in the window has budget data', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'months-under-budget')).toBeUndefined()
  })
})

describe('computeInsights — overall', () => {
  it('returns fewer than 2 insights when there is no transaction history at all', () => {
    const insights = computeInsights({ expenses: [], categoryNames: {}, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.length).toBeLessThan(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/insights.ts` does not exist.

- [ ] **Step 3: Implement the insights engine**

Create `lib/insights.ts`:

```ts
import { currentMonthInManila, monthsAgoInManila, todayInManila } from './date'

const WINDOW_MONTHS = 6
const DORMANT_THRESHOLD_DAYS = 10

export type InsightExpenseRow = {
  occurredOn: string
  amount: number
  categoryId: string | null
  notes: string | null
  isAdjustment: boolean
}

export type InsightAccount = {
  id: string
  name: string
  archived: boolean
  lastActivityOn: string | null
}

export type InsightBudgetRow = {
  month: string
  plannedAmount: number
}

export type Insight =
  | { kind: 'highest-spend-month'; month: string; monthTotal: number; topLabel: string; topAmount: number }
  | { kind: 'budget-pace'; spentSoFar: number; projected: number; budget: number }
  | { kind: 'top-category'; categoryName: string; toppedMonths: number; windowMonths: number; averagePerMonth: number }
  | { kind: 'dormant-account'; accountName: string; daysSinceActivity: number }
  | { kind: 'months-under-budget'; underCount: number; consideredCount: number }

export type ComputeInsightsInput = {
  expenses: InsightExpenseRow[]
  categoryNames: Record<string, string>
  accounts: InsightAccount[]
  budgets: InsightBudgetRow[]
  referenceDate?: Date
}

function completeMonthWindow(referenceDate: Date): string[] {
  const months: string[] = []
  for (let n = WINDOW_MONTHS; n >= 1; n--) months.push(monthsAgoInManila(n, referenceDate))
  return months
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(later) - Date.parse(earlier)) / 86_400_000)
}

function highestSpendMonth(expenses: InsightExpenseRow[], monthKeys: string[], categoryNames: Record<string, string>): Insight | null {
  const spending = expenses.filter((e) => !e.isAdjustment)
  let bestMonth: string | null = null
  let bestTotal = 0

  for (const month of monthKeys) {
    const prefix = month.slice(0, 7)
    const total = spending.filter((e) => e.occurredOn.startsWith(prefix)).reduce((sum, e) => sum + e.amount, 0)
    if (total > bestTotal) {
      bestTotal = total
      bestMonth = month
    }
  }
  if (bestMonth === null) return null

  const prefix = bestMonth.slice(0, 7)
  const rowsInMonth = spending.filter((e) => e.occurredOn.startsWith(prefix))
  const topRow = rowsInMonth.reduce((top, row) => (row.amount > top.amount ? row : top))
  const topLabel = topRow.notes?.trim() || (topRow.categoryId ? categoryNames[topRow.categoryId] : undefined) || 'Uncategorized'

  return { kind: 'highest-spend-month', month: bestMonth, monthTotal: bestTotal, topLabel, topAmount: topRow.amount }
}

function budgetPace(expenses: InsightExpenseRow[], budgets: InsightBudgetRow[], referenceDate: Date): Insight | null {
  const currentMonth = currentMonthInManila(referenceDate)
  const budget = budgets.filter((b) => b.month === currentMonth).reduce((sum, b) => sum + b.plannedAmount, 0)
  if (budget === 0) return null

  const prefix = currentMonth.slice(0, 7)
  const spentSoFar = expenses
    .filter((e) => !e.isAdjustment && e.occurredOn.startsWith(prefix))
    .reduce((sum, e) => sum + e.amount, 0)

  const today = todayInManila(referenceDate)
  const dayOfMonth = Number(today.slice(8, 10))
  const [year, month] = currentMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const projected = (spentSoFar / dayOfMonth) * daysInMonth

  return { kind: 'budget-pace', spentSoFar, projected, budget }
}

function topRecurringCategory(
  expenses: InsightExpenseRow[],
  monthKeys: string[],
  categoryNames: Record<string, string>
): Insight | null {
  const spending = expenses.filter((e) => !e.isAdjustment && e.categoryId !== null)
  const toppedCounts = new Map<string, number>()
  const windowTotals = new Map<string, number>()

  for (const month of monthKeys) {
    const prefix = month.slice(0, 7)
    const inMonth = spending.filter((e) => e.occurredOn.startsWith(prefix))
    if (inMonth.length === 0) continue

    const totalsThisMonth = new Map<string, number>()
    for (const row of inMonth) {
      const id = row.categoryId!
      totalsThisMonth.set(id, (totalsThisMonth.get(id) ?? 0) + row.amount)
      windowTotals.set(id, (windowTotals.get(id) ?? 0) + row.amount)
    }
    let topId: string | null = null
    let topAmount = 0
    for (const [id, amount] of totalsThisMonth) {
      if (amount > topAmount) {
        topAmount = amount
        topId = id
      }
    }
    if (topId !== null) toppedCounts.set(topId, (toppedCounts.get(topId) ?? 0) + 1)
  }

  if (toppedCounts.size === 0) return null

  let winnerId: string | null = null
  let winnerToppedCount = -1
  let winnerTotal = -1
  for (const [id, count] of toppedCounts) {
    const total = windowTotals.get(id) ?? 0
    if (count > winnerToppedCount || (count === winnerToppedCount && total > winnerTotal)) {
      winnerId = id
      winnerToppedCount = count
      winnerTotal = total
    }
  }

  return {
    kind: 'top-category',
    categoryName: (winnerId && categoryNames[winnerId]) || 'Unknown',
    toppedMonths: winnerToppedCount,
    windowMonths: WINDOW_MONTHS,
    averagePerMonth: winnerTotal / WINDOW_MONTHS,
  }
}

function dormantAccount(accounts: InsightAccount[], referenceDate: Date): Insight | null {
  const today = todayInManila(referenceDate)
  const candidates = accounts
    .filter((a) => !a.archived && a.lastActivityOn !== null)
    .map((a) => ({ name: a.name, days: daysBetween(a.lastActivityOn as string, today) }))
    .filter((a) => a.days >= DORMANT_THRESHOLD_DAYS)

  if (candidates.length === 0) return null

  const mostDormant = candidates.reduce((worst, current) => (current.days > worst.days ? current : worst))
  return { kind: 'dormant-account', accountName: mostDormant.name, daysSinceActivity: mostDormant.days }
}

function monthsUnderBudget(expenses: InsightExpenseRow[], budgets: InsightBudgetRow[], monthKeys: string[]): Insight | null {
  const spending = expenses.filter((e) => !e.isAdjustment)
  let consideredCount = 0
  let underCount = 0

  for (const month of monthKeys) {
    const budget = budgets.filter((b) => b.month === month).reduce((sum, b) => sum + b.plannedAmount, 0)
    if (budget === 0) continue
    consideredCount++
    const prefix = month.slice(0, 7)
    const spend = spending.filter((e) => e.occurredOn.startsWith(prefix)).reduce((sum, e) => sum + e.amount, 0)
    if (spend <= budget) underCount++
  }

  if (consideredCount === 0) return null
  return { kind: 'months-under-budget', underCount, consideredCount }
}

export function computeInsights(input: ComputeInsightsInput): Insight[] {
  const referenceDate = input.referenceDate ?? new Date()
  const monthKeys = completeMonthWindow(referenceDate)

  const results = [
    highestSpendMonth(input.expenses, monthKeys, input.categoryNames),
    budgetPace(input.expenses, input.budgets, referenceDate),
    topRecurringCategory(input.expenses, monthKeys, input.categoryNames),
    dormantAccount(input.accounts, referenceDate),
    monthsUnderBudget(input.expenses, input.budgets, monthKeys),
  ]

  return results.filter((insight): insight is Insight => insight !== null)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `insights.test.ts` assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/insights.ts lib/insights.test.ts
git commit -m "Add auto-generated insights engine (5 rule types)"
```

---

### Task 3: Portfolio net-per-ticker math

**Files:**
- Create: `lib/portfolio.ts`
- Create: `lib/portfolio.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `type PortfolioTransactionRow = { type: 'buy' | 'sell' | 'deposit' | 'withdraw'; ticker: string | null; company: string | null; amount: number }` and `computeNetByTicker(rows: PortfolioTransactionRow[]): Array<{ label: string; netAmount: number }>` — consumed by Task 8's `PortfolioSummary.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `lib/portfolio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeNetByTicker, type PortfolioTransactionRow } from './portfolio'

describe('computeNetByTicker', () => {
  it('adds buys and deposits, subtracts sells and withdrawals, grouped by ticker', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: 'AAPL', company: 'Apple', amount: 10000 },
      { type: 'buy', ticker: 'AAPL', company: 'Apple', amount: 2400 },
      { type: 'sell', ticker: 'AAPL', company: 'Apple', amount: 1000 },
      { type: 'deposit', ticker: 'VOO', company: null, amount: 9000 },
      { type: 'withdraw', ticker: 'VOO', company: null, amount: 100 },
    ]
    const result = computeNetByTicker(rows)
    expect(result).toEqual([
      { label: 'AAPL', netAmount: 11400 },
      { label: 'VOO', netAmount: 8900 },
    ])
  })

  it('sorts results descending by net amount', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: 'BDO', company: null, amount: 3200 },
      { type: 'buy', ticker: 'AAPL', company: null, amount: 12400 },
    ]
    expect(computeNetByTicker(rows).map((r) => r.label)).toEqual(['AAPL', 'BDO'])
  })

  it('falls back to company name, then "Uncategorized", when ticker is missing', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: null, company: 'Some Bank', amount: 500 },
      { type: 'buy', ticker: null, company: null, amount: 250 },
    ]
    const result = computeNetByTicker(rows)
    expect(result).toEqual([
      { label: 'Some Bank', netAmount: 500 },
      { label: 'Uncategorized', netAmount: 250 },
    ])
  })

  it('returns an empty array for no transactions', () => {
    expect(computeNetByTicker([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/portfolio.ts` does not exist.

- [ ] **Step 3: Implement the calculation**

Create `lib/portfolio.ts`:

```ts
export type PortfolioTransactionRow = {
  type: 'buy' | 'sell' | 'deposit' | 'withdraw'
  ticker: string | null
  company: string | null
  amount: number
}

export type TickerNetPosition = {
  label: string
  netAmount: number
}

export function computeNetByTicker(rows: PortfolioTransactionRow[]): TickerNetPosition[] {
  const totals = new Map<string, number>()
  const order: string[] = []

  for (const row of rows) {
    const label = row.ticker?.trim() || row.company?.trim() || 'Uncategorized'
    if (!totals.has(label)) {
      totals.set(label, 0)
      order.push(label)
    }
    const sign = row.type === 'buy' || row.type === 'deposit' ? 1 : -1
    totals.set(label, totals.get(label)! + sign * row.amount)
  }

  return order
    .map((label) => ({ label, netAmount: totals.get(label)! }))
    .sort((a, b) => b.netAmount - a.netAmount)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio.ts lib/portfolio.test.ts
git commit -m "Add portfolio net-per-ticker calculation"
```

---

### Task 4: Motion primitives

**Files:**
- Create: `lib/motion.ts`
- Create: `lib/motion.test.ts`
- Create: `app/(app)/dashboard/CountUp.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: none.
- Produces:
  - `TAPPABLE_CLASS: string` (`lib/motion.ts`) — the shared hover-grow + press-shrink Tailwind class string, consumed by Task 7's `AccountCardsRow.tsx`, Task 9's `PeriodSelector.tsx`, and anywhere else a tappable row/card/pill appears.
  - `STAGGER_DELAYS_MS: number[]` (`lib/motion.ts`) — consumed by Task 10's section-wrapper wiring.
  - `easeOutCubic(t: number): number` and `interpolateCount(target: number, progress: number): number` (`lib/motion.ts`) — consumed by `CountUp.tsx` in this task.
  - `CountUp({ value, prefix, durationMs }: { value: number; prefix?: string; durationMs?: number }): JSX.Element` (`app/(app)/dashboard/CountUp.tsx`) — consumed by Task 6's `HeroKpis.tsx`.
  - `.dash-ground`, `.dash-panel`, `.dash-enter` CSS classes and the `dash-enter` keyframe (`app/globals.css`) — consumed by Tasks 6–9.

This task is verified by type-check and unit tests only — `CountUp` isn't visibly wired into a page until Task 6, matching how Transactions core's quick-add sheet (its Task 5) was type-checked in isolation before Task 6 wired it in.

- [ ] **Step 1: Write the failing tests for the pure motion math**

Create `lib/motion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { easeOutCubic, interpolateCount } from './motion'

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('front-loads progress (decelerates toward the end)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe('interpolateCount', () => {
  it('returns 0 at progress 0 and the target at progress 1', () => {
    expect(interpolateCount(1000, 0)).toBe(0)
    expect(interpolateCount(1000, 1)).toBe(1000)
  })

  it('applies the easing curve at a midpoint', () => {
    // easeOutCubic(0.5) = 1 - 0.5^3 = 0.875 → 1000 * 0.875 = 875
    expect(interpolateCount(1000, 0.5)).toBe(875)
  })

  it('clamps progress outside [0, 1]', () => {
    expect(interpolateCount(1000, -0.5)).toBe(0)
    expect(interpolateCount(1000, 1.5)).toBe(1000)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/motion.ts` does not exist.

- [ ] **Step 3: Implement the motion primitives**

Create `lib/motion.ts`:

```ts
export const TAPPABLE_CLASS =
  'cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.06] active:scale-[0.94] active:duration-75'

export const STAGGER_DELAYS_MS = [0, 70, 140, 210, 280, 350]

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function interpolateCount(target: number, progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return Math.round(target * easeOutCubic(clamped))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write the CountUp component**

Create `app/(app)/dashboard/CountUp.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { interpolateCount } from '@/lib/motion'
import { formatCurrency } from '@/lib/format'

export function CountUp({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const start = performance.now()
    function tick(now: number) {
      const progress = (now - start) / durationMs
      setDisplay(interpolateCount(value, progress))
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [value, durationMs])

  return <span className="tabular-nums">{formatCurrency(display)}</span>
}
```

- [ ] **Step 6: Add the shared dashboard CSS classes**

Append to `app/globals.css`:

```css
.dash-ground {
  background:
    radial-gradient(160% 110% at 8% -15%, #3f5da3 0%, transparent 60%),
    radial-gradient(140% 100% at 108% 118%, #b9791f 0%, transparent 58%),
    linear-gradient(160deg, #0a0d12 0%, #0e1015 50%, #120e0a 100%);
}

.dash-panel {
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.09);
}

.font-ledger-serif {
  font-family: var(--font-fraunces), Georgia, serif;
}

.font-ledger-sans {
  font-family: var(--font-work-sans), -apple-system, sans-serif;
}

.font-ledger-mono {
  font-family: var(--font-ibm-plex-mono), ui-monospace, monospace;
}

@keyframes dash-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dash-enter {
  animation: dash-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/motion.ts lib/motion.test.ts "app/(app)/dashboard/CountUp.tsx" app/globals.css
git commit -m "Add motion primitives: hover-grow/press-shrink class, count-up, stagger keyframe"
```

---

### Task 5: Dark shell chrome on the Home tab

**Files:**
- Create: `app/(app)/ShellChrome.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: none new (same props `layout.tsx` already assembles: `accounts`, nav items, the `logout` action).
- Produces: `ShellChrome({ children }: { children: ReactNode }): JSX.Element` — wraps the header, `{children}`, and bottom nav, replacing their raw JSX directly inside `layout.tsx`. No later task consumes `ShellChrome` directly (it's mounted once, in `layout.tsx`).

- [ ] **Step 1: Write the shell chrome component**

Create `app/(app)/ShellChrome.tsx`:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { NavLink } from './NavLink'
import { logout } from './actions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

export function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isHome = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <div className={`flex min-h-screen flex-col ${isHome ? 'bg-[#0a0d12]' : 'bg-slate-50'}`}>
      <header
        className={`flex items-center justify-between border-b px-4 py-3 ${
          isHome ? 'border-white/10 bg-[#0e1015] text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <span className="font-semibold">Personal Finance</span>
        <form action={logout}>
          <button
            type="submit"
            className={`text-sm ${isHome ? 'text-white/60 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Log out
          </button>
        </form>
      </header>

      <main className="flex-1 p-4 pb-24">{children}</main>

      <nav
        className={`sticky bottom-0 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] ${
          isHome ? 'border-white/10 bg-[#0e1015]' : 'border-slate-200 bg-white'
        }`}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
    </div>
  )
}
```

`NavLink`'s own active/inactive text colors (`text-slate-900` / `text-slate-600`) stay as-is for now — they read acceptably on the dark nav background too (both are dark, legible against the near-black `#0e1015`); revisit only if manual verification in Step 4 shows otherwise.

- [ ] **Step 2: Wire it into the layout**

In `app/(app)/layout.tsx`, replace the `NavLink` import and the returned JSX. The data-fetching (`accounts`, `categories`, `defaultAccountId`, `rankedCategoryIds`, the `QuickAddProvider` wrapper) stays exactly as-is — only the header/`<main>`/nav markup moves into `ShellChrome`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShellChrome } from './ShellChrome'
import { QuickAddProvider } from './quick-add/QuickAddProvider'
import { mostRecentAccountId, rankCategoriesByUsage } from '@/lib/transactions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [accountsResult, categoriesResult, recentIncomeResult, recentExpenseResult, recentCategoryUseResult] =
    await Promise.all([
      supabase.from('accounts').select('id, name, archived').order('name'),
      supabase.from('categories').select('id, name, archived').order('name'),
      supabase.from('income').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('expenses').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
      supabase
        .from('expenses')
        .select('category_id')
        .not('category_id', 'is', null)
        .gte('occurred_on', ninetyDaysAgo.toISOString().slice(0, 10)),
    ])

  for (const result of [accountsResult, categoriesResult, recentIncomeResult, recentExpenseResult, recentCategoryUseResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []

  const recentUses = [
    ...(recentIncomeResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
    ...(recentExpenseResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
  ]
  const defaultAccountId = mostRecentAccountId(recentUses)

  const rankedCategoryIds = rankCategoriesByUsage(
    (recentCategoryUseResult.data ?? []).map((row) => row.category_id as string)
  )

  return (
    <QuickAddProvider
      accounts={accounts}
      categories={categories}
      defaultAccountId={defaultAccountId}
      rankedCategoryIds={rankedCategoryIds}
    >
      <ShellChrome>{children}</ShellChrome>
    </QuickAddProvider>
  )
}
```

Delete the now-unused `NavLink` import from `layout.tsx` (it's imported inside `ShellChrome.tsx` instead) and the `logout` import (same reason).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Start the dev server, log in (ask the human for the password step per this project's existing convention).

1. Visit `/transactions` (or any non-Home tab). Confirm the header and bottom nav are unchanged — light background, as before.
2. Navigate to `/dashboard`. Confirm the header and bottom nav both switch to the dark treatment (`#0e1015` background, white/light text) — the page's own `<main>` content is still the old placeholder text at this point in the plan, that's expected.
3. Navigate back to `/transactions`. Confirm the chrome reverts to light immediately (no flash of the wrong theme).
4. Confirm the "+" FAB and quick-add sheet still work from `/dashboard` (click it, confirm the sheet opens, cancel without submitting).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ShellChrome.tsx" "app/(app)/layout.tsx"
git commit -m "Add dark shell chrome that activates only on the Home tab"
```

---

### Task 6: Dashboard page shell — Masthead, Hero/KPIs, empty state

**Files:**
- Create: `app/(app)/dashboard/fonts.ts`
- Create: `app/(app)/dashboard/Masthead.tsx`
- Create: `app/(app)/dashboard/HeroKpis.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `computeAccountBalances` (existing, `lib/transactions.ts`), `currentMonthInManila` (existing, `lib/date.ts`), `formatCurrency` (existing, `lib/format.ts`), `CountUp` (Task 4), `.dash-ground`/`.dash-panel`/`.font-ledger-*`/`.dash-enter` classes (Task 4).
- Produces: `app/(app)/dashboard/page.tsx` now does the full data fetch this whole sub-project depends on. Its shape (documented in Step 3) is consumed by Tasks 7–9, which each add one more section to the same page.

- [ ] **Step 1: Set up the dashboard's fonts**

Create `app/(app)/dashboard/fonts.ts`:

```ts
import { Fraunces, Work_Sans, IBM_Plex_Mono } from 'next/font/google'

export const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-fraunces' })
export const workSans = Work_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-work-sans' })
export const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-ibm-plex-mono' })
```

- [ ] **Step 2: Write the Masthead**

Create `app/(app)/dashboard/Masthead.tsx`:

```tsx
export function Masthead({ displayName, today, dayOfMonth, daysInMonth }: {
  displayName: string
  today: string
  dayOfMonth: number
  daysInMonth: number
}) {
  return (
    <div className="dash-enter flex items-end justify-between gap-4 border-b-2 border-white/35 pb-3">
      <div>
        <p className="font-ledger-sans text-[11px] uppercase tracking-[0.12em] text-[#c3c9dd]">{displayName}</p>
        <h1 className="font-ledger-serif mt-1 text-[25px] font-semibold text-[#f9f6ee]">This month, at a glance</h1>
      </div>
      <p className="font-ledger-mono text-right text-[11px] text-[#b9bdcb]">
        {today}
        <br />
        Day {dayOfMonth} of {daysInMonth}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Write HeroKpis**

Create `app/(app)/dashboard/HeroKpis.tsx`:

```tsx
import { CountUp } from './CountUp'
import { formatCurrency } from '@/lib/format'

export function HeroKpis({
  total,
  incomeMtd,
  expenseMtd,
  netMtd,
  budgetPercentUsed,
}: {
  total: number
  incomeMtd: number
  expenseMtd: number
  netMtd: number
  budgetPercentUsed: number | null
}) {
  return (
    <div className="dash-panel font-ledger-serif grid grid-cols-1 gap-5 rounded-2xl p-5 sm:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="font-ledger-sans text-[10.5px] uppercase tracking-[0.1em] text-[#b9bdcb]">
          Total across accounts
        </p>
        <p className="mt-1 text-[40px] leading-none text-[#9cbaf0]">
          <CountUp value={total} />
        </p>
      </div>
      <div className="flex">
        <div className="flex-1 border-l border-white/15 pl-4 first:border-l-0 first:pl-0">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Income (MTD)</p>
          <p className="text-[18px] font-semibold text-[#6cd3a5]">{formatCurrency(incomeMtd)}</p>
        </div>
        <div className="flex-1 border-l border-white/15 pl-4">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Expenses (MTD)</p>
          <p className="text-[18px] font-semibold text-[#ed8264]">{formatCurrency(expenseMtd)}</p>
          {budgetPercentUsed !== null && (
            <p className="font-ledger-sans mt-1 text-[11px] text-[#b9bdcb]">{budgetPercentUsed}% of budget used</p>
          )}
        </div>
        <div className="flex-1 border-l border-white/15 pl-4">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Net (MTD)</p>
          <p className={`text-[18px] font-semibold ${netMtd < 0 ? 'text-[#ed8264]' : 'text-[#6cd3a5]'}`}>
            {formatCurrency(netMtd)}
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the dashboard page**

Replace the full contents of `app/(app)/dashboard/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { computeAccountBalances } from '@/lib/transactions'
import { currentMonthInManila, todayInManila } from '@/lib/date'
import { fraunces, workSans, ibmPlexMono } from './fonts'
import { Masthead } from './Masthead'
import { HeroKpis } from './HeroKpis'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [accountsResult, categoriesResult, incomeResult, expensesResult, budgetsResult, portfolioResult] =
    await Promise.all([
      supabase.from('accounts').select('id, name, archived').order('name'),
      supabase.from('categories').select('id, name'),
      supabase.from('income').select('occurred_on, amount, account_id, is_adjustment'),
      supabase.from('expenses').select('occurred_on, amount, account_id, category_id, notes, is_adjustment'),
      supabase.from('budgets').select('month, planned_amount'),
      supabase.from('portfolio_transactions').select('type, ticker, company, amount'),
    ])

  for (const result of [accountsResult, categoriesResult, incomeResult, expensesResult, budgetsResult, portfolioResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const accounts = accountsResult.data ?? []
  const income = incomeResult.data ?? []
  const expenses = expensesResult.data ?? []
  const budgets = budgetsResult.data ?? []

  const balances = computeAccountBalances(
    accounts.map((a) => a.id),
    income.map((row) => ({ accountId: row.account_id, amount: row.amount })),
    expenses.map((row) => ({ accountId: row.account_id, amount: row.amount }))
  )
  const total = Object.values(balances).reduce((sum, b) => sum + b, 0)

  const currentMonth = currentMonthInManila()
  const monthPrefix = currentMonth.slice(0, 7)
  const incomeMtd = income
    .filter((row) => row.occurred_on.startsWith(monthPrefix))
    .reduce((sum, row) => sum + row.amount, 0)
  const expenseMtd = expenses
    .filter((row) => row.occurred_on.startsWith(monthPrefix))
    .reduce((sum, row) => sum + row.amount, 0)
  const netMtd = incomeMtd - expenseMtd

  const budgetTotalMtd = budgets
    .filter((b) => b.month === currentMonth)
    .reduce((sum, b) => sum + b.planned_amount, 0)
  const budgetPercentUsed = budgetTotalMtd > 0 ? Math.round((expenseMtd / budgetTotalMtd) * 100) : null

  const today = todayInManila()
  const dayOfMonth = Number(today.slice(8, 10))
  const [y, m] = currentMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()

  const displayName = (user?.user_metadata?.full_name as string | undefined)?.trim() || 'Your Ledger'

  return (
    <div className={`dash-ground -m-4 mb-[-6rem] min-h-[calc(100vh-8rem)] p-4 pb-28 ${fraunces.variable} ${workSans.variable} ${ibmPlexMono.variable}`}>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <Masthead displayName={displayName} today={today} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} />
        <HeroKpis
          total={total}
          incomeMtd={incomeMtd}
          expenseMtd={expenseMtd}
          netMtd={netMtd}
          budgetPercentUsed={budgetPercentUsed}
        />
        {income.length === 0 && expenses.length === 0 && (
          <p className="font-ledger-sans dash-panel rounded-2xl p-5 text-sm text-[#c3c9dd]">
            Add your first transaction to see insights here.
          </p>
        )}
      </div>
    </div>
  )
}
```

The `-m-4 mb-[-6rem] p-4 pb-28` combination cancels out `ShellChrome`'s `<main className="p-4 pb-24">` padding so the glow background reaches the screen edges (matching the "full-bleed" requirement in the design spec) while keeping the actual content inset — this is the only page under `app/(app)/` that needs to fight its parent's padding, because it's the only one with an edge-to-edge background. Tasks 7–9 add more sections inside the same `<div className="mx-auto flex max-w-xl flex-col gap-4">` wrapper; the empty-state paragraph above is temporary scaffolding that Task 7's `InsightsPanel` subsumes (its own minimum-content fallback covers this same case more specifically) — remove it in Task 7 rather than keeping both.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual browser verification**

With the dev server running and logged in, navigate to `/dashboard`.

1. Confirm the masthead, hero total, and MTD KPI row render with the dark glow background reaching the very edges of the viewport (not just a padded box).
2. Confirm the hero total and KPI figures count up from ₱0 on load (Task 4's `CountUp`).
3. Confirm "Add your first transaction to see insights here" is visible (the live account has no transactions yet).
4. Confirm `budgetPercentUsed` does *not* render (no `budgets` rows exist yet on the live site) — no "NaN% of budget used" or similar.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard/fonts.ts" "app/(app)/dashboard/Masthead.tsx" "app/(app)/dashboard/HeroKpis.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "Build dashboard page shell: masthead, hero total, MTD KPIs, empty state"
```

---

### Task 7: Insights panel + Account cards row

**Files:**
- Create: `app/(app)/dashboard/InsightsPanel.tsx`
- Create: `app/(app)/dashboard/AccountCardsRow.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeInsights`, `Insight` type (Task 2); `TAPPABLE_CLASS` (Task 4); `formatCurrency` (existing).
- Produces: both components are terminal (rendered by `page.tsx`, consumed by nothing later).

- [ ] **Step 1: Write the Insights panel**

Create `app/(app)/dashboard/InsightsPanel.tsx`:

```tsx
import type { Insight } from '@/lib/insights'
import { formatCurrency } from '@/lib/format'

const MARKS: Record<Insight['kind'], string> = {
  'highest-spend-month': '“',
  'budget-pace': '↗',
  'top-category': '★',
  'dormant-account': '–',
  'months-under-budget': '✓',
}

function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00`).toLocaleDateString('en-US', { month: 'long' })
}

function describe(insight: Insight): React.ReactNode {
  switch (insight.kind) {
    case 'highest-spend-month':
      return (
        <>
          <strong>{monthLabel(insight.month)}</strong> was your highest-spend month this half-year —{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.monthTotal)}</span>. The single biggest push was{' '}
          <strong>{insight.topLabel}</strong> at <span className="font-ledger-mono">{formatCurrency(insight.topAmount)}</span>.
        </>
      )
    case 'budget-pace': {
      const pacing = insight.projected <= insight.budget ? 'under' : 'over'
      return (
        <>
          You&rsquo;re pacing <strong>{pacing} budget</strong> this month —{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.spentSoFar)}</span> spent so far, projected to land
          near <span className="font-ledger-mono">{formatCurrency(insight.projected)}</span> against a{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.budget)}</span> budget.
        </>
      )
    }
    case 'top-category':
      return (
        <>
          <strong>{insight.categoryName}</strong> has topped your spending {insight.toppedMonths} of the last{' '}
          {insight.windowMonths} months, averaging{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.averagePerMonth)}</span>/mo.
        </>
      )
    case 'dormant-account':
      return (
        <>
          <strong>{insight.accountName}</strong> hasn&rsquo;t moved in {insight.daysSinceActivity} days.
        </>
      )
    case 'months-under-budget':
      return (
        <>
          You stayed under budget in <strong>{insight.underCount} of the last {insight.consideredCount}</strong> months.
        </>
      )
  }
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length < 2) {
    return (
      <div className="dash-panel dash-enter font-ledger-sans rounded-2xl p-5 text-sm text-[#c3c9dd]">
        Add more transactions to see insights here.
      </div>
    )
  }

  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        What stood out
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">Auto-generated</span>
      </h2>
      <div className="flex flex-col">
        {insights.map((insight, i) => (
          <div
            key={insight.kind}
            className={`font-ledger-sans flex gap-3 py-2.5 text-[13px] leading-relaxed text-[#ece6d8] ${
              i > 0 ? 'border-t border-white/10' : ''
            }`}
          >
            <span className="font-ledger-serif w-5 flex-none text-center text-[22px] text-[#f0b854]">
              {MARKS[insight.kind]}
            </span>
            <span>{describe(insight)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the Account cards row**

Create `app/(app)/dashboard/AccountCardsRow.tsx`:

```tsx
import { formatCurrency } from '@/lib/format'
import { TAPPABLE_CLASS } from '@/lib/motion'

const CARD_COLORS = ['#f0b854', '#9cbaf0', '#d99fc0', '#6cd3a5']

export function AccountCardsRow({ accounts }: { accounts: Array<{ id: string; name: string; balance: number }> }) {
  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 text-[16px] text-[#f9f6ee]">By account</h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {accounts.map((account, i) => (
          <div
            key={account.id}
            tabIndex={0}
            className={`${TAPPABLE_CLASS} w-32 flex-none rounded-2xl border border-white/10 bg-white/5 p-3`}
          >
            <div
              className="font-ledger-serif mb-3 flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold text-[#12151b]"
              style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
            >
              {account.name.slice(0, 1)}
            </div>
            <p className="font-ledger-sans mb-0.5 text-[11px] text-[#c3c7d3]">{account.name}</p>
            <p className="font-ledger-mono text-[15px] font-bold text-[#f9f6ee]">{formatCurrency(account.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire both into the dashboard page**

In `app/(app)/dashboard/page.tsx`:

1. Add imports:

```tsx
import { computeInsights, type InsightAccount, type InsightExpenseRow, type InsightBudgetRow } from '@/lib/insights'
import { InsightsPanel } from './InsightsPanel'
import { AccountCardsRow } from './AccountCardsRow'
```

2. After the existing `categoriesResult` handling, build the category name lookup and the per-account last-activity map, then call `computeInsights`:

```tsx
  const categories = categoriesResult.data ?? []
  const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  const lastActivityByAccount = new Map<string, string>()
  for (const row of [...income, ...expenses]) {
    const prev = lastActivityByAccount.get(row.account_id)
    if (!prev || row.occurred_on > prev) lastActivityByAccount.set(row.account_id, row.occurred_on)
  }

  const insightAccounts: InsightAccount[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    archived: a.archived,
    lastActivityOn: lastActivityByAccount.get(a.id) ?? null,
  }))
  const insightExpenses: InsightExpenseRow[] = expenses.map((e) => ({
    occurredOn: e.occurred_on,
    amount: e.amount,
    categoryId: e.category_id,
    notes: e.notes,
    isAdjustment: e.is_adjustment,
  }))
  const insightBudgets: InsightBudgetRow[] = budgets.map((b) => ({ month: b.month, plannedAmount: b.planned_amount }))

  const insights = computeInsights({
    expenses: insightExpenses,
    categoryNames,
    accounts: insightAccounts,
    budgets: insightBudgets,
  })

  const accountCards = accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, name: a.name, balance: balances[a.id] ?? 0 }))
```

3. Replace the placeholder empty-state paragraph (Task 6, Step 4) with the two new sections, right after `<HeroKpis ... />`:

```tsx
        <HeroKpis
          total={total}
          incomeMtd={incomeMtd}
          expenseMtd={expenseMtd}
          netMtd={netMtd}
          budgetPercentUsed={budgetPercentUsed}
        />
        <InsightsPanel insights={insights} />
        <AccountCardsRow accounts={accountCards} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

With the dev server running and logged in, navigate to `/dashboard`.

1. Confirm "Add more transactions to see insights here" renders in place of the insights list (the live site has no data — this is the `insights.length < 2` fallback from Step 1, correctly triggered).
2. Confirm the 4 seeded accounts render as horizontally-scrollable cards, each showing `₱0.00`.
3. Hover a card with a mouse — confirm it grows slightly (`TAPPABLE_CLASS`'s hover-scale). Click and hold — confirm it shrinks slightly while held.
4. Resize to mobile width, confirm the cards row scrolls horizontally without breaking the page layout.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/InsightsPanel.tsx" "app/(app)/dashboard/AccountCardsRow.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "Add insights panel and account cards row to dashboard"
```

---

### Task 8: Portfolio summary + Category bars

**Files:**
- Create: `app/(app)/dashboard/PortfolioSummary.tsx`
- Create: `app/(app)/dashboard/CategoryBars.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeNetByTicker` (Task 3); `formatCurrency` (existing).
- Produces: both components are terminal.

- [ ] **Step 1: Write the Portfolio summary**

Create `app/(app)/dashboard/PortfolioSummary.tsx`:

```tsx
import { formatCurrency } from '@/lib/format'
import type { TickerNetPosition } from '@/lib/portfolio'

const DOT_COLORS = ['#9cbaf0', '#f0b854', '#d99fc0', '#6cd3a5']

export function PortfolioSummary({ positions }: { positions: TickerNetPosition[] }) {
  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        Portfolio
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">Money moved, not live value</span>
      </h2>
      {positions.length === 0 ? (
        <p className="font-ledger-sans text-sm text-[#c3c9dd]">No portfolio activity yet.</p>
      ) : (
        <div className="flex flex-col">
          {positions.map((position, i) => (
            <div
              key={position.label}
              className={`font-ledger-sans flex items-center gap-2.5 py-1.5 text-[13px] text-[#ece6d8] ${
                i > 0 ? 'border-t border-white/10' : ''
              }`}
            >
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
              />
              <span className="flex-1">{position.label}</span>
              <span className="font-ledger-mono font-semibold">{formatCurrency(position.netAmount)} net in</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the Category bars**

Create `app/(app)/dashboard/CategoryBars.tsx`:

```tsx
import { formatCurrency } from '@/lib/format'

export function CategoryBars({ categories }: { categories: Array<{ name: string; amount: number }> }) {
  const max = Math.max(...categories.map((c) => c.amount), 1)

  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        By category
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">MTD</span>
      </h2>
      {categories.length === 0 ? (
        <p className="font-ledger-sans text-sm text-[#c3c9dd]">No spending yet this month.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <div key={category.name} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <span className="font-ledger-sans truncate text-[12.5px] text-[#ece6d8]">{category.name}</span>
              <div className="h-3 rounded-r bg-white/10">
                <div
                  className="h-full rounded-r bg-[#9cbaf0]"
                  style={{ width: `${(category.amount / max) * 100}%` }}
                />
              </div>
              <span className="font-ledger-mono text-right text-[12px] text-[#b9bdcb]">
                {formatCurrency(category.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire both into the dashboard page**

In `app/(app)/dashboard/page.tsx`:

1. Add imports:

```tsx
import { computeNetByTicker } from '@/lib/portfolio'
import { PortfolioSummary } from './PortfolioSummary'
import { CategoryBars } from './CategoryBars'
```

2. After building `insightExpenses`/`insightBudgets`, derive the portfolio positions and MTD category totals:

```tsx
  const portfolio = portfolioResult.data ?? []
  const portfolioPositions = computeNetByTicker(
    portfolio.map((p) => ({ type: p.type, ticker: p.ticker, company: p.company, amount: p.amount }))
  )

  const categoryNamesById = new Map(categories.map((c) => [c.id, c.name]))
  const mtdCategoryTotals = new Map<string, number>()
  for (const row of expenses) {
    if (row.is_adjustment || row.category_id === null || !row.occurred_on.startsWith(monthPrefix)) continue
    mtdCategoryTotals.set(row.category_id, (mtdCategoryTotals.get(row.category_id) ?? 0) + row.amount)
  }
  const categoryBars = [...mtdCategoryTotals.entries()]
    .map(([id, amount]) => ({ name: categoryNamesById.get(id) ?? 'Unknown', amount }))
    .sort((a, b) => b.amount - a.amount)
```

3. Add both sections after `<AccountCardsRow ... />`:

```tsx
        <AccountCardsRow accounts={accountCards} />
        <PortfolioSummary positions={portfolioPositions} />
        <CategoryBars categories={categoryBars} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

With the dev server running and logged in, navigate to `/dashboard`.

1. Confirm "No portfolio activity yet." renders (the live site has no `portfolio_transactions` rows).
2. Confirm "No spending yet this month." renders under "By category" (no expense rows exist yet).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/PortfolioSummary.tsx" "app/(app)/dashboard/CategoryBars.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "Add portfolio summary and category breakdown to dashboard"
```

---

### Task 9: Trend chart + period selector

**Files:**
- Create: `app/(app)/dashboard/TrendChart.tsx`
- Create: `app/(app)/dashboard/PeriodSelector.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `computeTrend`, `TrendMonthPoint` (Task 1); `TAPPABLE_CLASS` (Task 4); `formatCurrency` (existing).
- Produces: both are terminal. `page.tsx` gains a `searchParams` prop, same pattern `app/(app)/transactions/page.tsx` already uses for its month filter.

- [ ] **Step 1: Write the Trend chart**

Create `app/(app)/dashboard/TrendChart.tsx`:

```tsx
'use client'

import { useRef, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import type { TrendMonthPoint } from '@/lib/trend'

const WIDTH = 600
const HEIGHT = 200
const PAD_LEFT = 44
const PAD_RIGHT = 16
const PAD_TOP = 14
const PAD_BOTTOM = 26
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM

function monthShortLabel(month: string, isCurrent: boolean): string {
  const label = new Date(`${month}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
  return isCurrent ? `${label}*` : label
}

export function TrendChart({ points }: { points: TrendMonthPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const maxVal = Math.max(...points.map((p) => Math.max(p.income, p.expense)), 1)
  const niceMax = Math.ceil(maxVal / 10000) * 10000 || 1

  function x(i: number): number {
    return points.length <= 1 ? PAD_LEFT : PAD_LEFT + (i / (points.length - 1)) * PLOT_WIDTH
  }
  function y(v: number): number {
    return PAD_TOP + PLOT_HEIGHT - (v / niceMax) * PLOT_HEIGHT
  }
  function path(key: 'income' | 'expense'): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  }
  const areaPath =
    points.length > 0 ? `${path('income')} L ${x(points.length - 1).toFixed(1)} ${y(0)} L ${x(0).toFixed(1)} ${y(0)} Z` : ''

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH
    const i = Math.max(0, Math.min(points.length - 1, Math.round((px - PAD_LEFT) / PLOT_WIDTH * (points.length - 1))))
    setHoverIndex(i)
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full cursor-crosshair"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="trend-income-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6cd3a5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6cd3a5" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((frac) => {
          const gy = PAD_TOP + PLOT_HEIGHT - frac * PLOT_HEIGHT
          return (
            <line
              key={frac}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={gy}
              y2={gy}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
          )
        })}

        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y={HEIGHT - 6} textAnchor="middle" fontSize="9.5" fill="#8891a3">
            {monthShortLabel(p.month, i === points.length - 1)}
          </text>
        ))}

        <path d={areaPath} fill="url(#trend-income-fill)" />
        <path d={path('expense')} fill="none" stroke="#ed8264" strokeWidth={2} />
        <path d={path('income')} fill="none" stroke="#6cd3a5" strokeWidth={2.5} />

        {hovered && (
          <>
            <line
              x1={x(hoverIndex!)}
              x2={x(hoverIndex!)}
              y1={PAD_TOP}
              y2={PAD_TOP + PLOT_HEIGHT}
              stroke="rgba(255,255,255,0.3)"
            />
            <circle cx={x(hoverIndex!)} cy={y(hovered.income)} r={3.5} fill="#6cd3a5" />
            <circle cx={x(hoverIndex!)} cy={y(hovered.expense)} r={3.5} fill="#ed8264" />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="font-ledger-sans pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border border-white/15 bg-[#1a1e26] px-2.5 py-1.5 text-[11px] text-[#ece6d8]"
          style={{ left: `${(x(hoverIndex!) / WIDTH) * 100}%`, top: `${(y(Math.max(hovered.income, hovered.expense)) / HEIGHT) * 100}%` }}
        >
          <p className="font-ledger-mono font-semibold">{monthShortLabel(hovered.month, hoverIndex === points.length - 1)}</p>
          <p>Income {formatCurrency(hovered.income)}</p>
          <p>Expense {formatCurrency(hovered.expense)}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the Period selector**

Create `app/(app)/dashboard/PeriodSelector.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { TAPPABLE_CLASS } from '@/lib/motion'

const OPTIONS = [3, 6, 9, 12]

export function PeriodSelector({ months }: { months: number }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  function choose(value: number) {
    setOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('months', String(value))
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${TAPPABLE_CLASS} font-ledger-sans inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11.5px] font-semibold text-[#c3c9dd]`}
      >
        {months} months <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-[#1a1e26]">
          {OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className="font-ledger-sans px-4 py-2 text-left text-[12.5px] text-[#c3c9dd] hover:bg-white/10"
            >
              {value} months
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire the trend section into the dashboard page**

In `app/(app)/dashboard/page.tsx`:

1. Add imports:

```tsx
import { computeTrend } from '@/lib/trend'
import { TrendChart } from './TrendChart'
import { PeriodSelector } from './PeriodSelector'
```

2. Give the page a `searchParams` prop and read the `months` value, defaulting to 6 and clamping to the allowed set:

```tsx
const TREND_MONTH_OPTIONS = [3, 6, 9, 12]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>
}) {
  const params = await searchParams
  const requestedMonths = Number(params.months)
  const trendMonths = TREND_MONTH_OPTIONS.includes(requestedMonths) ? requestedMonths : 6

  const supabase = await createClient()
  // ...rest of the existing fetch/derivation logic is unchanged...
```

3. After deriving `categoryBars`, compute the trend points:

```tsx
  const trendPoints = computeTrend(
    trendMonths,
    income.map((row) => ({ occurredOn: row.occurred_on, amount: row.amount })),
    expenses.map((row) => ({ occurredOn: row.occurred_on, amount: row.amount }))
  )
```

4. Add the section after `<CategoryBars ... />`:

```tsx
        <CategoryBars categories={categoryBars} />
        <div className="dash-panel dash-enter rounded-2xl p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-ledger-serif text-[16px] text-[#f9f6ee]">Trend</h2>
            <PeriodSelector months={trendMonths} />
          </div>
          <div className="font-ledger-sans mb-1.5 flex gap-4 text-[11.5px] text-[#c3c9dd]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-[#6cd3a5]" />
              Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded-full bg-[#ed8264]" />
              Expenses
            </span>
          </div>
          <TrendChart points={trendPoints} />
        </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

With the dev server running and logged in, navigate to `/dashboard`.

1. Confirm the trend chart renders its axes and a "6 months ▾" pill, even with all-zero data (no broken/empty box).
2. Click the pill — confirm the dropdown shows 3/6/9/12. Pick "3 months" — confirm the URL updates to `?months=3` and the chart re-renders with 3 month labels.
3. Move the mouse across the chart — confirm the crosshair line, both dots, and the tooltip (month + income + expense) track the cursor.
4. Reload at `/dashboard?months=9` directly — confirm it renders 9 months and the pill shows "9 months" (proves the search param round-trips on a fresh load, not just client navigation).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/TrendChart.tsx" "app/(app)/dashboard/PeriodSelector.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "Add trend chart with hover crosshair and 3/6/9/12-month period selector"
```

---

### Task 10: Staggered entrance, final regression pass, progress notes

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `docs/superpowers/PROGRESS.md`

**Interfaces:**
- Consumes: `STAGGER_DELAYS_MS` (Task 4).
- Produces: none — this is the plan's closing task.

- [ ] **Step 1: Apply staggered entrance delays**

In `app/(app)/dashboard/page.tsx`, import `STAGGER_DELAYS_MS` from `@/lib/motion` and give each top-level section an explicit `animationDelay` (the `.dash-enter` class from Task 4 already sets `animation: dash-enter ... both`; only the delay needs to vary per section). Wrap the six section elements — `Masthead`, `HeroKpis`, `InsightsPanel`, `AccountCardsRow`, `PortfolioSummary`, and the `<div>` containing `CategoryBars` + the trend card (treat that pair as one entrance group, matching the design spec's six-section list in §6) — each with `style={{ animationDelay: `${STAGGER_DELAYS_MS[i]}ms` }}` for `i` 0 through 5, e.g.:

```tsx
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[0]}ms` }}>
          <Masthead displayName={displayName} today={today} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} />
        </div>
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[1]}ms` }}>
          <HeroKpis total={total} incomeMtd={incomeMtd} expenseMtd={expenseMtd} netMtd={netMtd} budgetPercentUsed={budgetPercentUsed} />
        </div>
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[2]}ms` }}>
          <InsightsPanel insights={insights} />
        </div>
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[3]}ms` }}>
          <AccountCardsRow accounts={accountCards} />
        </div>
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[4]}ms` }}>
          <PortfolioSummary positions={portfolioPositions} />
        </div>
        <div style={{ animationDelay: `${STAGGER_DELAYS_MS[5]}ms` }} className="flex flex-col gap-4">
          <CategoryBars categories={categoryBars} />
          <div className="dash-panel dash-enter rounded-2xl p-5">
            {/* ...existing trend card contents from Task 9, unchanged... */}
          </div>
        </div>
```

Since the trend card is now nested inside an already-`dash-enter`-wrapped `<div>`, remove the `dash-enter` class from that inner trend card's own `className` (leave `dash-panel rounded-2xl p-5`) so it doesn't double-animate independently of its parent.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full end-to-end manual walkthrough**

With the dev server running and logged in:

1. Reload `/dashboard`. Confirm the six sections fade/slide in one after another rather than popping in simultaneously.
2. Confirm the hero total and KPI figures count up at the same time as the entrance animation, not after it.
3. Navigate away to `/transactions` and back to `/dashboard` — confirm the header/nav dark-toggle (Task 5) and the entrance animation both replay correctly on re-entry.
4. Hover and press an account card, the period-selector pill, and a portfolio row — confirm all three grow on hover and shrink on press identically (shared `TAPPABLE_CLASS`).
5. Resize the browser to the "mobile" preset. Reload. Confirm: the glow background still reaches the edges, the account-cards row scrolls horizontally without breaking the page width, the trend chart and its tooltip stay legible, and the bottom nav's dark styling still applies safe-area padding correctly (inherited from `ShellChrome`, unchanged from Transactions core).
6. Take a screenshot of `/dashboard` at mobile viewport size for the record.

- [ ] **Step 4: Update progress notes**

Edit `docs/superpowers/PROGRESS.md`: add a "Dashboard & Insights sub-project: ✅ COMPLETE" section (same style as the existing "Transactions core sub-project" section), summarizing what shipped (insights engine, portfolio summary, account cards, category bars, trend chart with period selector, motion system, dark-only shell-chrome toggle on Home). Update "How to resume in a new session" to point at Budgeting (sub-project 2, next in the stated sequence) as the next step, referencing `docs/superpowers/specs/2026-08-19-dashboard-insights-design.md` §11 for the full remaining sequence.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" docs/superpowers/PROGRESS.md
git commit -m "Wire staggered entrance; update progress notes: Dashboard & Insights complete"
```

(If Step 3 surfaced a real bug, fix it, re-verify, and commit that fix as its own commit before this one.)
