# Budgeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/budget` stub with a required weekly overall budget (the app's headline screen), optional per-category monthly budgets, and recurring constants (taxes/subscriptions/salary) that auto-post as real transactions on schedule.

**Architecture:** Two new tables (`weekly_budgets`, `recurring_constants`) plus a nullable `recurring_constant_id` tag on `income`/`expenses`. All budget math (week-anchoring, ×4/÷7 derivation, due-date advancement) lives in small pure functions in `lib/`, unit-tested in isolation — matching the existing `lib/insights.ts` / `lib/trend.ts` pattern. Recurring constants auto-post via a catch-up check added to `app/(app)/layout.tsx`, which already runs on every authenticated page load.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19 (Server Actions, `useActionState`), Tailwind CSS, Supabase (Postgres + RLS), Vitest.

This is sub-project 2 of 5 (see `docs/superpowers/PROGRESS.md`; full sequence in
`docs/superpowers/specs/2026-08-19-dashboard-insights-design.md` §11). Design
spec: `docs/superpowers/specs/2026-08-20-budgeting-design.md` — read it
first for the product rationale behind every decision below. Follows
Transactions core and Dashboard & Insights (both shipped); precedes
Portfolio and Historical migration.

## Global Constraints

- Next.js App Router + TypeScript only — no plain JavaScript files.
- Tailwind CSS for all styling — no separate CSS modules or styled-components.
- Every Supabase table has Row-Level Security with owner-only
  (`auth.uid() = user_id`) policies — every new table in this plan follows
  the same four-policy pattern.
- All money values are displayed via the shared `formatCurrency` helper
  (`lib/format.ts`) — never format currency ad hoc.
- `SUPABASE_SERVICE_ROLE_KEY` must never be imported into any file under
  `app/`, `lib/`, or `proxy.ts` — only scripts under `scripts/` read it.
- **Amount sign convention:** every amount column is always positive;
  direction is implied by table/`kind`, enforced by `check (amount > 0)`.
  Never store or accept a negative amount.
- **Date defaults** ("today", "current week") are computed in
  `Asia/Manila` local time via `lib/date.ts`'s `todayInManila()` — never
  via a naive server `Date()`.
- **Weeks are Monday–Sunday (ISO calendar week)**, independent of month
  boundaries. "Monthly" and "daily" budget figures are always *derived*
  (current week's planned amount × 4, ÷ 7 respectively) — never stored,
  never computed by summing multiple weeks.
- **Per-category budgets stay monthly** (unchanged from the original v1
  design) — only the overall budget is weekly. Do not add a week
  granularity to the `budgets` table.
- **Recurring-constant auto-posted rows are dated to when they were due**
  (`next_due_on` at the time), never to today's date — a skipped day or
  two of not opening the app must not shift the transaction date.
- **Editing a recurring constant only ever affects future occurrences.**
  Already-posted rows are ordinary `income`/`expenses` rows at that point.
- **There is only one Supabase environment for this app — the live
  production project.** Any manual verification step that creates data
  through the UI or a script must delete/undo it afterward. Never leave
  test rows behind.

---

### Task 1: Schema migration — weekly budgets, recurring constants

**Files:**
- Create: `supabase/migrations/0005_budgeting.sql`
- Create: `scripts/verify-budgeting-migration.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SEED_USER_EMAIL` env vars (already in
  `.env.local`).
- Produces: `weekly_budgets(id, week_start, planned_amount, created_at)`,
  `recurring_constants(id, kind, amount, category_id, account_id, source,
  notes, frequency, day_of_month, month_of_year, next_due_on, active,
  created_at)`, `income.recurring_constant_id`,
  `expenses.recurring_constant_id` — consumed by every later task.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-budgeting-migration.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const userEmail = process.env.SEED_USER_EMAIL!

const anon = createClient(url, anonKey)
const admin = createClient(url, serviceRoleKey)

let failures = 0

// 1. Confirm the new tables/columns exist. limit(0) is validated against
// the schema before RLS runs, so an anon client is safe: an unknown
// table/column errors regardless of RLS, a known one returns empty data.
const columnChecks: Array<[string, string]> = [
  ['weekly_budgets', 'week_start'],
  ['weekly_budgets', 'planned_amount'],
  ['recurring_constants', 'next_due_on'],
  ['recurring_constants', 'active'],
  ['income', 'recurring_constant_id'],
  ['expenses', 'recurring_constant_id'],
]
for (const [table, column] of columnChecks) {
  const { error } = await anon.from(table).select(column).limit(0)
  if (error) {
    console.log(`${table}.${column}: FAIL — ${error.message}`)
    failures++
  } else {
    console.log(`${table}.${column}: OK (column exists)`)
  }
}

// 2. Confirm the check constraints reject bad data. Every insert below is
// expected to FAIL, so nothing is left behind. Uses the service role so a
// check-constraint violation is what's under test, not an RLS policy.
const { data: usersPage, error: userError } = await admin.auth.admin.listUsers()
if (userError) throw userError
const user = usersPage.users.find((u) => u.email === userEmail)
if (!user) throw new Error(`No Supabase auth user found with email ${userEmail}`)

const { data: anAccount, error: accountError } = await admin
  .from('accounts')
  .select('id')
  .eq('user_id', user.id)
  .limit(1)
  .single()
if (accountError) throw accountError

const CHECK_VIOLATION = '23514'

async function expectCheckViolation(label: string, table: string, payload: Record<string, unknown>) {
  const { error } = await admin.from(table).insert({ ...payload, user_id: user!.id })
  if (error?.code === CHECK_VIOLATION) {
    console.log(`${label}: OK (rejected)`)
  } else {
    console.log(`${label}: FAIL — expected a check violation, got ${JSON.stringify(error)}`)
    failures++
  }
}

await expectCheckViolation('weekly_budgets_planned_amount_positive', 'weekly_budgets', {
  week_start: '2026-01-05',
  planned_amount: 0,
})

await expectCheckViolation('recurring_constants_expense_needs_category', 'recurring_constants', {
  kind: 'expense',
  amount: 1,
  account_id: anAccount.id,
  category_id: null,
  frequency: 'monthly',
  day_of_month: 1,
  next_due_on: '2026-01-01',
})

await expectCheckViolation('recurring_constants_income_needs_source', 'recurring_constants', {
  kind: 'income',
  amount: 1,
  account_id: anAccount.id,
  source: null,
  frequency: 'monthly',
  day_of_month: 1,
  next_due_on: '2026-01-01',
})

await expectCheckViolation('recurring_constants_yearly_needs_month', 'recurring_constants', {
  kind: 'income',
  amount: 1,
  account_id: anAccount.id,
  source: 'test',
  frequency: 'yearly',
  day_of_month: 1,
  month_of_year: null,
  next_due_on: '2026-01-01',
})

if (failures > 0) {
  throw new Error(`${failures} check(s) failed verification`)
}

console.log('All budgeting migration checks verified.')
```

- [ ] **Step 2: Run it before the migration exists (expect FAILures)**

Run: `npx tsx --env-file=.env.local scripts/verify-budgeting-migration.ts`
Expected: every column check reports `FAIL` and every constraint check
reports `FAIL` (the tables/columns/constraints don't exist yet, so the
inserts succeed instead of being rejected), and the script exits non-zero.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0005_budgeting.sql`:

```sql
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
```

- [ ] **Step 4: Apply the migration (manual)**

In the Supabase dashboard, go to **SQL Editor → New query**, paste the full
contents of `supabase/migrations/0005_budgeting.sql`, and click **Run**.
Expected: "Success. No rows returned."

- [ ] **Step 5: Run the verification script again (expect all OK)**

Run: `npx tsx --env-file=.env.local scripts/verify-budgeting-migration.ts`
Expected: every line prints `OK`, then `All budgeting migration checks
verified.`, exiting 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_budgeting.sql scripts/verify-budgeting-migration.ts
git commit -m "Add budgeting schema: weekly_budgets, recurring_constants"
```

---

### Task 2: Weekly-budget pure logic

**Files:**
- Create: `lib/weekly-budget.ts`
- Test: `lib/weekly-budget.test.ts`

**Interfaces:**
- Consumes: nothing (pure date-string arithmetic, no framework/DB deps).
- Produces: `mondayOfWeek(dateStr: string): string`,
  `addDays(dateStr: string, days: number): string`,
  `deriveMonthlyBudget(weeklyAmount: number): number`,
  `deriveDailyBudget(weeklyAmount: number): number`,
  `computeLeftover(income: number, budgeted: number): number`,
  `needsNextWeekReminder(today: string, currentWeekStart: string, nextWeekIsSet: boolean): boolean`,
  `formatWeekRange(weekStart: string): string` — all consumed by Tasks 4,
  5, 7, and 10.

- [ ] **Step 1: Write the failing tests**

Create `lib/weekly-budget.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  mondayOfWeek,
  addDays,
  deriveMonthlyBudget,
  deriveDailyBudget,
  computeLeftover,
  needsNextWeekReminder,
  formatWeekRange,
} from './weekly-budget'

describe('mondayOfWeek', () => {
  it('returns the same date when it is already a Monday', () => {
    expect(mondayOfWeek('2026-08-17')).toBe('2026-08-17')
  })

  it('returns the prior Monday for a mid-week date', () => {
    expect(mondayOfWeek('2026-08-19')).toBe('2026-08-17') // Wednesday
  })

  it('returns the prior Monday for a Sunday (end of the ISO week)', () => {
    expect(mondayOfWeek('2026-08-23')).toBe('2026-08-17')
  })

  it('handles a week that spans a month boundary', () => {
    expect(mondayOfWeek('2026-09-02')).toBe('2026-08-31') // Wednesday, week starts in August
  })
})

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-08-17', 6)).toBe('2026-08-23')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-08-29', 6)).toBe('2026-09-04')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-29', 6)).toBe('2027-01-04')
  })
})

describe('deriveMonthlyBudget / deriveDailyBudget', () => {
  it('derives monthly as weekly x4', () => {
    expect(deriveMonthlyBudget(2000)).toBe(8000)
  })

  it('derives daily as weekly /7', () => {
    expect(deriveDailyBudget(700)).toBeCloseTo(100, 5)
  })
})

describe('computeLeftover', () => {
  it('is positive when income exceeds budgeted', () => {
    expect(computeLeftover(5000, 2000)).toBe(3000)
  })

  it('is negative when budgeted exceeds income', () => {
    expect(computeLeftover(1000, 2000)).toBe(-1000)
  })
})

describe('needsNextWeekReminder', () => {
  const currentWeekStart = '2026-08-17' // Mon Aug 17 - Sun Aug 23

  it('is false when next week is already set, regardless of timing', () => {
    expect(needsNextWeekReminder('2026-08-23', currentWeekStart, true)).toBe(false)
  })

  it('is true on the last day of the week when next week is unset', () => {
    expect(needsNextWeekReminder('2026-08-23', currentWeekStart, false)).toBe(true) // Sunday, 0 days left
  })

  it('is true two days before the week ends', () => {
    expect(needsNextWeekReminder('2026-08-21', currentWeekStart, false)).toBe(true) // Friday, 2 days left
  })

  it('is false more than two days before the week ends', () => {
    expect(needsNextWeekReminder('2026-08-20', currentWeekStart, false)).toBe(false) // Thursday, 3 days left
  })
})

describe('formatWeekRange', () => {
  it('formats a week entirely within one month', () => {
    expect(formatWeekRange('2026-08-17')).toBe('Aug 17–23')
  })

  it('formats a week that spans two months', () => {
    expect(formatWeekRange('2026-08-31')).toBe('Aug 31–Sep 6')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/weekly-budget.test.ts`
Expected: FAIL — `lib/weekly-budget.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/weekly-budget.ts`:

```ts
const MS_PER_DAY = 86_400_000
const REMINDER_WINDOW_DAYS = 2

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = date.getUTCDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  return addDays(dateStr, -diffToMonday)
}

export function deriveMonthlyBudget(weeklyAmount: number): number {
  return weeklyAmount * 4
}

export function deriveDailyBudget(weeklyAmount: number): number {
  return weeklyAmount / 7
}

export function computeLeftover(income: number, budgeted: number): number {
  return income - budgeted
}

export function needsNextWeekReminder(today: string, currentWeekStart: string, nextWeekIsSet: boolean): boolean {
  if (nextWeekIsSet) return false
  const weekEnd = addDays(currentWeekStart, 6) // Sunday
  const daysUntilWeekEnd = Math.round((Date.parse(weekEnd) - Date.parse(today)) / MS_PER_DAY)
  return daysUntilWeekEnd >= 0 && daysUntilWeekEnd <= REMINDER_WINDOW_DAYS
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const weekEnd = addDays(weekStart, 6)
  const end = new Date(`${weekEnd}T00:00:00Z`)
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const endLabel =
    start.getUTCMonth() === end.getUTCMonth()
      ? end.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
      : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${startLabel}–${endLabel}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/weekly-budget.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/weekly-budget.ts lib/weekly-budget.test.ts
git commit -m "Add weekly-budget pure logic: week-anchoring, derivation, reminder window"
```

---

### Task 3: Recurring-constant pure logic

**Files:**
- Create: `lib/recurring.ts`
- Test: `lib/recurring.test.ts`

**Interfaces:**
- Consumes: nothing (pure date-string arithmetic).
- Produces: `type RecurringFrequency = 'monthly' | 'yearly'`,
  `computeInitialNextDueOn(frequency, dayOfMonth, monthOfYear, today): string`,
  `advanceNextDueOn(currentDueOn, frequency, dayOfMonth, monthOfYear): string`
  — both consumed by Tasks 4 and 6.

- [ ] **Step 1: Write the failing tests**

Create `lib/recurring.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeInitialNextDueOn, advanceNextDueOn } from './recurring'

describe('computeInitialNextDueOn — monthly', () => {
  it('uses this month when the due day has not passed yet', () => {
    expect(computeInitialNextDueOn('monthly', 20, null, '2026-08-10')).toBe('2026-08-20')
  })

  it('is today when the due day is today', () => {
    expect(computeInitialNextDueOn('monthly', 10, null, '2026-08-10')).toBe('2026-08-10')
  })

  it('skips to next month when the due day already passed', () => {
    expect(computeInitialNextDueOn('monthly', 5, null, '2026-08-10')).toBe('2026-09-05')
  })

  it('rolls over a year boundary', () => {
    expect(computeInitialNextDueOn('monthly', 5, null, '2026-12-10')).toBe('2027-01-05')
  })

  it('clamps a day that does not exist in the target month', () => {
    expect(computeInitialNextDueOn('monthly', 31, null, '2026-02-01')).toBe('2026-02-28') // 2026 is not a leap year
  })
})

describe('computeInitialNextDueOn — yearly', () => {
  it('uses this year when the due date has not passed yet', () => {
    expect(computeInitialNextDueOn('yearly', 15, 12, '2026-08-10')).toBe('2026-12-15')
  })

  it('skips to next year when the due date already passed', () => {
    expect(computeInitialNextDueOn('yearly', 15, 4, '2026-08-10')).toBe('2027-04-15')
  })

  it('clamps a day that does not exist in the target month', () => {
    expect(computeInitialNextDueOn('yearly', 29, 2, '2026-01-01')).toBe('2026-02-28') // 2026 is not a leap year
  })
})

describe('advanceNextDueOn — monthly', () => {
  it('advances to the same day next month', () => {
    expect(advanceNextDueOn('2026-08-15', 'monthly', 15, null)).toBe('2026-09-15')
  })

  it('rolls over a year boundary', () => {
    expect(advanceNextDueOn('2026-12-15', 'monthly', 15, null)).toBe('2027-01-15')
  })

  it('clamps when the next month is shorter', () => {
    expect(advanceNextDueOn('2026-01-31', 'monthly', 31, null)).toBe('2026-02-28')
  })
})

describe('advanceNextDueOn — yearly', () => {
  it('advances to the same date next year', () => {
    expect(advanceNextDueOn('2026-04-15', 'yearly', 15, 4)).toBe('2027-04-15')
  })

  it('clamps a leap-day constant in a non-leap year', () => {
    expect(advanceNextDueOn('2028-02-29', 'yearly', 29, 2)).toBe('2029-02-28') // 2028 is a leap year, 2029 is not
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/recurring.test.ts`
Expected: FAIL — `lib/recurring.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `lib/recurring.ts`:

```ts
export type RecurringFrequency = 'monthly' | 'yearly'

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the *next* month is the last day of `month`.
  return new Date(year, month, 0).getDate()
}

function clampToMonth(year: number, month: number, day: number): string {
  const clampedDay = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

export function computeInitialNextDueOn(
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null,
  today: string
): string {
  const [todayYear, todayMonth] = today.slice(0, 7).split('-').map(Number)

  if (frequency === 'monthly') {
    const thisMonthDue = clampToMonth(todayYear, todayMonth, dayOfMonth)
    if (thisMonthDue >= today) return thisMonthDue
    const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1
    const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear
    return clampToMonth(nextYear, nextMonth, dayOfMonth)
  }

  const month = monthOfYear as number
  const thisYearDue = clampToMonth(todayYear, month, dayOfMonth)
  if (thisYearDue >= today) return thisYearDue
  return clampToMonth(todayYear + 1, month, dayOfMonth)
}

export function advanceNextDueOn(
  currentDueOn: string,
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null
): string {
  const [year, month] = currentDueOn.slice(0, 7).split('-').map(Number)

  if (frequency === 'monthly') {
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    return clampToMonth(nextYear, nextMonth, dayOfMonth)
  }

  return clampToMonth(year + 1, monthOfYear as number, dayOfMonth)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/recurring.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/recurring.ts lib/recurring.test.ts
git commit -m "Add recurring-constant due-date pure logic"
```

---

### Task 4: Recurring-constant catch-up, wired into the app layout

**Files:**
- Create: `lib/recurring-catchup.ts`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `advanceNextDueOn` (Task 3), `todayInManila` (`lib/date.ts`).
- Produces: `postDueRecurringConstants(supabase: SupabaseClient, referenceDate?: Date): Promise<void>` —
  called once per request from `app/(app)/layout.tsx`, before its existing
  data-fetching `Promise.all`, so a freshly posted row is visible in the
  same page load.

- [ ] **Step 1: Write the implementation**

Create `lib/recurring-catchup.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { advanceNextDueOn, type RecurringFrequency } from './recurring'
import { todayInManila } from './date'

type DueConstant = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  category_id: string | null
  account_id: string
  source: string | null
  notes: string | null
  frequency: RecurringFrequency
  day_of_month: number
  month_of_year: number | null
  next_due_on: string
}

// Runs on every authenticated page load (called from app/(app)/layout.tsx).
// Posts every occurrence that's come due since the last time the app was
// opened, dated to when each was actually due — not to today. A single
// UPDATE ... WHERE next_due_on = <the value we just read> claims each
// occurrence before posting it, so two concurrent tabs/requests can't both
// post the same one: whichever request's UPDATE affects zero rows lost the
// race and stops instead of double-posting.
export async function postDueRecurringConstants(supabase: SupabaseClient, referenceDate: Date = new Date()): Promise<void> {
  const today = todayInManila(referenceDate)

  const { data: due, error } = await supabase
    .from('recurring_constants')
    .select('id, kind, amount, category_id, account_id, source, notes, frequency, day_of_month, month_of_year, next_due_on')
    .eq('active', true)
    .lte('next_due_on', today)
  if (error) throw new Error(error.message)

  for (const constant of (due ?? []) as DueConstant[]) {
    let dueOn = constant.next_due_on
    while (dueOn <= today) {
      const nextDueOn = advanceNextDueOn(dueOn, constant.frequency, constant.day_of_month, constant.month_of_year)

      const { data: claimed, error: claimError } = await supabase
        .from('recurring_constants')
        .update({ next_due_on: nextDueOn })
        .eq('id', constant.id)
        .eq('next_due_on', dueOn)
        .select('id')
      if (claimError) throw new Error(claimError.message)
      if (!claimed || claimed.length === 0) break // another request already claimed this occurrence

      const basePayload = {
        occurred_on: dueOn,
        amount: constant.amount,
        account_id: constant.account_id,
        notes: constant.notes,
        recurring_constant_id: constant.id,
      }
      const { error: insertError } =
        constant.kind === 'expense'
          ? await supabase.from('expenses').insert({ ...basePayload, category_id: constant.category_id })
          : await supabase.from('income').insert({ ...basePayload, source: constant.source })
      if (insertError) throw new Error(insertError.message)

      dueOn = nextDueOn
    }
  }
}
```

- [ ] **Step 2: Wire it into the app layout**

Modify `app/(app)/layout.tsx` — add the import and call it before the
existing `Promise.all`:

```ts
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { postDueRecurringConstants } from '@/lib/recurring-catchup'
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

  await postDueRecurringConstants(supabase)

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

- [ ] **Step 3: Manual verification**

There's no unit-test framework for Supabase-touching code in this
codebase (matches the existing convention — `app/(app)/accounts/actions.ts`
has no test file either). Verify by hand with the dev server running and
logged in:

1. Create a throwaway seed script — `scripts/tmp-seed-recurring-test.ts`
   (not committed; deleted in step 4 below) — reusing the same
   service-role/`SEED_USER_EMAIL` pattern as
   `scripts/verify-budgeting-migration.ts`:

   ```ts
   import { createClient } from '@supabase/supabase-js'

   const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
   const { data: usersPage } = await admin.auth.admin.listUsers()
   const user = usersPage.users.find((u) => u.email === process.env.SEED_USER_EMAIL!)!

   const { data: account } = await admin.from('accounts').select('id').eq('user_id', user.id).limit(1).single()
   const { data: category } = await admin.from('categories').select('id').eq('user_id', user.id).limit(1).single()

   const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
   const { data: inserted, error } = await admin
     .from('recurring_constants')
     .insert({
       user_id: user.id,
       kind: 'expense',
       amount: 50,
       category_id: category!.id,
       account_id: account!.id,
       frequency: 'monthly',
       day_of_month: Number(yesterday.slice(8, 10)),
       next_due_on: yesterday,
     })
     .select('id')
     .single()
   if (error) throw error
   console.log('Seeded recurring_constants row:', inserted.id)
   ```

   Run: `npx tsx --env-file=.env.local scripts/tmp-seed-recurring-test.ts`
   — note the printed row id for cleanup in step 4.
2. Load any page in the app (e.g. `/dashboard`). Confirm a new expense row
   appears in `/transactions` dated to yesterday (visually just a normal
   row for now — the "Auto" badge is added in Task 9's UI work, but the
   row's `recurring_constant_id` can be confirmed directly in the Supabase
   table editor).
3. Confirm `recurring_constants.next_due_on` for that row advanced to one
   month after yesterday's date (also checkable in the table editor).
4. Delete the test expense row and the seeded `recurring_constants` row
   (using the id printed in step 1) through the Supabase dashboard table
   editor, then delete `scripts/tmp-seed-recurring-test.ts` — it was never
   committed and isn't part of this task's Files list (per the Global
   Constraint: never leave test rows behind).

- [ ] **Step 4: Commit**

```bash
git add lib/recurring-catchup.ts "app/(app)/layout.tsx"
git commit -m "Auto-post due recurring constants on every authenticated page load"
```

---

### Task 5: Weekly-budget and category-budget server actions

**Files:**
- Create: `app/(app)/budget/actions.ts`

**Interfaces:**
- Consumes: `createClient` (`lib/supabase/server`).
- Produces: `setWeeklyBudget(weekStart: string, formData: FormData): Promise<void>`,
  `setCategoryBudget(month: string, categoryId: string, formData: FormData): Promise<void>`,
  `removeCategoryBudget(month: string, categoryId: string): Promise<void>` —
  consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the implementation**

Create `app/(app)/budget/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')
  return supabase
}

function parseAmount(formData: FormData): number {
  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  return amount
}

export async function setWeeklyBudget(weekStart: string, formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const amount = parseAmount(formData)

  const { error } = await supabase
    .from('weekly_budgets')
    .upsert({ week_start: weekStart, planned_amount: amount }, { onConflict: 'user_id,week_start' })
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function setCategoryBudget(month: string, categoryId: string, formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const amount = parseAmount(formData)

  const { error } = await supabase
    .from('budgets')
    .upsert({ month, category_id: categoryId, planned_amount: amount }, { onConflict: 'user_id,month,category_id' })
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function removeCategoryBudget(month: string, categoryId: string): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('budgets').delete().eq('month', month).eq('category_id', categoryId)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/budget/actions.ts"
git commit -m "Add weekly-budget and category-budget server actions"
```

---

### Task 6: Recurring-constant server actions

**Files:**
- Create: `app/(app)/budget/recurring-actions.ts`

**Interfaces:**
- Consumes: `computeInitialNextDueOn` (Task 3), `todayInManila` (`lib/date.ts`).
- Produces: `type RecurringConstantFormState = { error: string | null; submitted: boolean }`,
  `addRecurringConstant(prevState, formData): Promise<RecurringConstantFormState>`,
  `updateRecurringConstant(id, prevState, formData): Promise<RecurringConstantFormState>`,
  `setRecurringConstantActive(id: string, active: boolean): Promise<void>`,
  `deleteRecurringConstant(id: string): Promise<void>` — consumed by Task 9.

- [ ] **Step 1: Write the implementation**

Create `app/(app)/budget/recurring-actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { computeInitialNextDueOn, type RecurringFrequency } from '@/lib/recurring'
import { todayInManila } from '@/lib/date'

export type RecurringConstantFormState = {
  error: string | null
  submitted: boolean
}

type ParsedConstant =
  | {
      ok: true
      kind: 'expense' | 'income'
      amount: number
      frequency: RecurringFrequency
      dayOfMonth: number
      monthOfYear: number | null
      accountId: string
      categoryId: string | null
      source: string | null
      notes: string | null
    }
  | { ok: false; error: string }

function parseFields(formData: FormData): ParsedConstant {
  const kindRaw = formData.get('kind')
  const kind = kindRaw === 'income' ? 'income' : 'expense'

  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }

  const frequencyRaw = formData.get('frequency')
  const frequency: RecurringFrequency = frequencyRaw === 'yearly' ? 'yearly' : 'monthly'

  const dayOfMonth = Number(formData.get('dayOfMonth'))
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, error: 'Day of month must be between 1 and 31.' }
  }

  let monthOfYear: number | null = null
  if (frequency === 'yearly') {
    monthOfYear = Number(formData.get('monthOfYear'))
    if (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12) {
      return { ok: false, error: 'Month is required for a yearly constant.' }
    }
  }

  const accountId = formData.get('accountId')
  if (typeof accountId !== 'string' || accountId.length === 0) {
    return { ok: false, error: 'Account is required.' }
  }

  const notesRaw = formData.get('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null

  if (kind === 'expense') {
    const categoryId = formData.get('categoryId')
    if (typeof categoryId !== 'string' || categoryId.length === 0) {
      return { ok: false, error: 'Category is required for an expense constant.' }
    }
    return { ok: true, kind, amount, frequency, dayOfMonth, monthOfYear, accountId, categoryId, source: null, notes }
  }

  const source = formData.get('source')
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'Source is required for an income constant.' }
  }
  return {
    ok: true,
    kind,
    amount,
    frequency,
    dayOfMonth,
    monthOfYear,
    accountId,
    categoryId: null,
    source: source.trim(),
    notes,
  }
}

export async function addRecurringConstant(
  _prevState: RecurringConstantFormState,
  formData: FormData
): Promise<RecurringConstantFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const nextDueOn = computeInitialNextDueOn(parsed.frequency, parsed.dayOfMonth, parsed.monthOfYear, todayInManila())

  const { error } = await supabase.from('recurring_constants').insert({
    kind: parsed.kind,
    amount: parsed.amount,
    frequency: parsed.frequency,
    day_of_month: parsed.dayOfMonth,
    month_of_year: parsed.monthOfYear,
    account_id: parsed.accountId,
    category_id: parsed.categoryId,
    source: parsed.source,
    notes: parsed.notes,
    next_due_on: nextDueOn,
  })
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/budget')
  return { error: null, submitted: true }
}

export async function updateRecurringConstant(
  id: string,
  _prevState: RecurringConstantFormState,
  formData: FormData
): Promise<RecurringConstantFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  // Editing only ever affects future occurrences: recompute next_due_on
  // from today under the new schedule, exactly like creation, instead of
  // reusing whatever next_due_on the old schedule left behind.
  const nextDueOn = computeInitialNextDueOn(parsed.frequency, parsed.dayOfMonth, parsed.monthOfYear, todayInManila())

  const { error } = await supabase
    .from('recurring_constants')
    .update({
      kind: parsed.kind,
      amount: parsed.amount,
      frequency: parsed.frequency,
      day_of_month: parsed.dayOfMonth,
      month_of_year: parsed.monthOfYear,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      source: parsed.source,
      notes: parsed.notes,
      next_due_on: nextDueOn,
    })
    .eq('id', id)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/budget')
  return { error: null, submitted: true }
}

export async function setRecurringConstantActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { error } = await supabase.from('recurring_constants').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function deleteRecurringConstant(id: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { error } = await supabase.from('recurring_constants').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/budget/recurring-actions.ts"
git commit -m "Add recurring-constant CRUD server actions"
```

---

### Task 7: Weekly budget screen — headline card and reminder banner

**Files:**
- Create: `app/(app)/budget/page.tsx` (replaces the stub)
- Create: `app/(app)/budget/WeeklyBudgetCard.tsx`
- Create: `app/(app)/budget/ReminderBanner.tsx`

**Interfaces:**
- Consumes: `setWeeklyBudget` (Task 5); `mondayOfWeek`, `addDays`,
  `deriveMonthlyBudget`, `deriveDailyBudget`, `computeLeftover`,
  `needsNextWeekReminder`, `formatWeekRange` (Task 2); `formatCurrency`
  (`lib/format.ts`); `todayInManila` (`lib/date.ts`).
- Produces: the `/budget` route rendering the required weekly budget —
  the deliverable this task is independently testable against. Tasks 8
  and 9 extend this same `page.tsx`.

- [ ] **Step 1: Write `WeeklyBudgetCard`**

Create `app/(app)/budget/WeeklyBudgetCard.tsx`:

```tsx
import { formatCurrency } from '@/lib/format'
import { deriveMonthlyBudget, deriveDailyBudget, computeLeftover, formatWeekRange } from '@/lib/weekly-budget'
import { setWeeklyBudget } from './actions'

export function WeeklyBudgetCard({
  weekStart,
  prevWeekStart,
  nextWeekStart,
  plannedAmount,
  spentSoFar,
  incomeThisWeek,
  isPastWeek,
}: {
  weekStart: string
  prevWeekStart: string
  nextWeekStart: string
  plannedAmount: number | null
  spentSoFar: number
  incomeThisWeek: number
  isPastWeek: boolean
}) {
  const remaining = plannedAmount !== null ? plannedAmount - spentSoFar : null
  const monthly = plannedAmount !== null ? deriveMonthlyBudget(plannedAmount) : null
  const daily = plannedAmount !== null ? deriveDailyBudget(plannedAmount) : null
  const leftover = plannedAmount !== null ? computeLeftover(incomeThisWeek, plannedAmount) : null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <a
          href={`/budget?week=${prevWeekStart}`}
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Previous week"
        >
          ◀
        </a>
        <h1 className="text-sm font-medium text-slate-600">Week of {formatWeekRange(weekStart)}</h1>
        <a
          href={`/budget?week=${nextWeekStart}`}
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Next week"
        >
          ▶
        </a>
      </div>

      {plannedAmount === null ? (
        isPastWeek ? (
          <p className="mt-4 text-center text-sm text-slate-500">No budget was set for this week.</p>
        ) : (
          <form action={setWeeklyBudget.bind(null, weekStart)} className="mt-4 flex gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="Set this week's budget"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
              Set
            </button>
          </form>
        )
      ) : (
        <>
          <p className="mt-2 text-center font-ledger-mono text-4xl font-semibold text-slate-900">
            {formatCurrency(plannedAmount)}
          </p>
          <p className="mt-1 text-center text-sm text-slate-500">
            {formatCurrency(spentSoFar)} spent · {formatCurrency(remaining as number)} remaining
          </p>

          <div className="mt-4 flex justify-center gap-6 text-center text-sm text-slate-500">
            <div>
              <p className="font-ledger-mono text-lg text-slate-700">{formatCurrency(monthly as number)}</p>
              <p>/month (×4)</p>
            </div>
            <div>
              <p className="font-ledger-mono text-lg text-slate-700">{formatCurrency(daily as number)}</p>
              <p>/day (÷7)</p>
            </div>
          </div>

          <p className={`mt-4 text-center text-sm ${(leftover as number) < 0 ? 'font-medium text-red-600' : 'text-slate-600'}`}>
            Income this week: {formatCurrency(incomeThisWeek)} · Leftover after budget:{' '}
            {formatCurrency(leftover as number)}
            {(leftover as number) < 0 ? ' — budgeted more than you have earned' : ''}
          </p>

          {!isPastWeek && (
            <details className="mt-3 text-center text-sm">
              <summary className="cursor-pointer text-slate-500">Change this week's budget</summary>
              <form action={setWeeklyBudget.bind(null, weekStart)} className="mt-2 flex gap-2">
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={plannedAmount}
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
                  Update
                </button>
              </form>
            </details>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Write `ReminderBanner`**

Create `app/(app)/budget/ReminderBanner.tsx`:

```tsx
import { formatWeekRange } from '@/lib/weekly-budget'

export function ReminderBanner({ nextWeekStart }: { nextWeekStart: string }) {
  return (
    <a
      href={`/budget?week=${nextWeekStart}`}
      className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
    >
      Set your budget for the week of {formatWeekRange(nextWeekStart)} →
    </a>
  )
}
```

- [ ] **Step 3: Write `page.tsx`**

Create `app/(app)/budget/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { todayInManila } from '@/lib/date'
import { mondayOfWeek, addDays, needsNextWeekReminder } from '@/lib/weekly-budget'
import { WeeklyBudgetCard } from './WeeklyBudgetCard'
import { ReminderBanner } from './ReminderBanner'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const today = todayInManila()
  const currentWeekStart = mondayOfWeek(today)
  const requestedWeek = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? mondayOfWeek(params.week) : currentWeekStart

  const supabase = await createClient()

  const [weeklyBudgetsResult, incomeResult, expensesResult] = await Promise.all([
    supabase.from('weekly_budgets').select('week_start, planned_amount'),
    supabase.from('income').select('occurred_on, amount'),
    supabase.from('expenses').select('occurred_on, amount, is_adjustment'),
  ])

  for (const result of [weeklyBudgetsResult, incomeResult, expensesResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const weeklyBudgets = weeklyBudgetsResult.data ?? []
  const income = incomeResult.data ?? []
  const expenses = expensesResult.data ?? []

  const weekEnd = addDays(requestedWeek, 6)
  const plannedAmount = weeklyBudgets.find((w) => w.week_start === requestedWeek)?.planned_amount ?? null
  const spentSoFar = expenses
    .filter((e) => !e.is_adjustment && e.occurred_on >= requestedWeek && e.occurred_on <= weekEnd)
    .reduce((sum, e) => sum + e.amount, 0)
  const incomeThisWeek = income
    .filter((row) => row.occurred_on >= requestedWeek && row.occurred_on <= weekEnd)
    .reduce((sum, row) => sum + row.amount, 0)

  const nextWeekStart = addDays(currentWeekStart, 7)
  const nextWeekIsSet = weeklyBudgets.some((w) => w.week_start === nextWeekStart)
  const showReminder = requestedWeek === currentWeekStart && needsNextWeekReminder(today, currentWeekStart, nextWeekIsSet)

  return (
    <div className="space-y-4">
      {showReminder && <ReminderBanner nextWeekStart={nextWeekStart} />}
      <WeeklyBudgetCard
        weekStart={requestedWeek}
        prevWeekStart={addDays(requestedWeek, -7)}
        nextWeekStart={addDays(requestedWeek, 7)}
        plannedAmount={plannedAmount}
        spentSoFar={spentSoFar}
        incomeThisWeek={incomeThisWeek}
        isPastWeek={requestedWeek < currentWeekStart}
      />
    </div>
  )
}
```

- [ ] **Step 4: Manual browser verification**

With the dev server running (`npm run dev`) and logged in, navigate to
`/budget` (ask the human to confirm login if needed — Claude never
handles the password itself):

1. Confirm the current week's card renders with a "Set this week's
   budget" input (no budget set yet the first time this runs).
2. Submit a budget amount (e.g. 2000). Confirm the card re-renders showing
   the big number, the ×4/÷7 derived monthly/daily figures, and the
   income/leftover line.
3. Click ▶ to go to next week; confirm it shows the unset-budget input
   (future weeks are settable in advance). Set one, then click ◀ twice to
   confirm it's a normal, editable week (not marked past).
4. Click ◀ from the current week to a week before any data exists; confirm
   it renders "No budget was set for this week." with no input (past
   weeks are read-only).
5. Delete the test budget rows created in steps 2–3 via the Supabase
   dashboard table editor afterward (never leave test rows behind).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/budget/page.tsx" "app/(app)/budget/WeeklyBudgetCard.tsx" "app/(app)/budget/ReminderBanner.tsx"
git commit -m "Build the weekly budget screen: headline card, navigator, reminder banner"
```

---

### Task 8: Optional per-category monthly budget table

**Files:**
- Create: `app/(app)/budget/CategoryBudgetTable.tsx`
- Modify: `app/(app)/budget/page.tsx`

**Interfaces:**
- Consumes: `setCategoryBudget`, `removeCategoryBudget` (Task 5);
  `currentMonthInManila` (`lib/date.ts`); `formatCurrency`.
- Produces: the collapsible per-category section, appended below
  `WeeklyBudgetCard` — independently testable: `/budget` still works with
  zero category budgets set, and adding one shows planned/actual/difference.

- [ ] **Step 1: Write `CategoryBudgetTable`**

Create `app/(app)/budget/CategoryBudgetTable.tsx`. Each unbudgeted
category gets its own small form (a Server Action bound via
`.bind(null, month, categoryId)` has `categoryId` fixed at render time,
so a single shared form with a `<select>` to change categories has
nowhere to send that choice — one form per category sidesteps that, and
the list is small, a handful of categories at most):

```tsx
import { formatCurrency } from '@/lib/format'
import { setCategoryBudget, removeCategoryBudget } from './actions'

export function CategoryBudgetTable({
  month,
  rows,
  unbudgetedCategories,
}: {
  month: string
  rows: Array<{ categoryId: string; categoryName: string; planned: number; actual: number }>
  unbudgetedCategories: Array<{ id: string; name: string }>
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Per-category budgets (optional)
      </summary>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No category budgets set for this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1 font-normal">Category</th>
                <th className="pb-1 font-normal">Planned</th>
                <th className="pb-1 font-normal">Actual</th>
                <th className="pb-1 font-normal">Difference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const difference = row.planned - row.actual
                return (
                  <tr key={row.categoryId} className="border-t border-slate-100">
                    <td className="py-1.5">{row.categoryName}</td>
                    <td className="py-1.5 font-ledger-mono">{formatCurrency(row.planned)}</td>
                    <td className="py-1.5 font-ledger-mono">{formatCurrency(row.actual)}</td>
                    <td className={`py-1.5 font-ledger-mono ${difference < 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(difference)}
                    </td>
                    <td className="py-1.5 text-right">
                      <form action={removeCategoryBudget.bind(null, month, row.categoryId)}>
                        <button type="submit" className="text-xs text-slate-400 hover:text-slate-700">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {unbudgetedCategories.length > 0 && (
          <div className="space-y-2 pt-2">
            {unbudgetedCategories.map((c) => (
              <form key={c.id} action={setCategoryBudget.bind(null, month, c.id)} className="flex items-center gap-2">
                <span className="w-28 flex-none text-sm text-slate-600">{c.name}</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Planned amount"
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                  Add
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
```

- [ ] **Step 2: Wire into `page.tsx`**

Modify `app/(app)/budget/page.tsx` — add the import, fetch `budgets` and
`categories`, compute rows, and render the table:

```tsx
import { createClient } from '@/lib/supabase/server'
import { todayInManila, currentMonthInManila } from '@/lib/date'
import { mondayOfWeek, addDays, needsNextWeekReminder } from '@/lib/weekly-budget'
import { WeeklyBudgetCard } from './WeeklyBudgetCard'
import { ReminderBanner } from './ReminderBanner'
import { CategoryBudgetTable } from './CategoryBudgetTable'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const today = todayInManila()
  const currentWeekStart = mondayOfWeek(today)
  const requestedWeek = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? mondayOfWeek(params.week) : currentWeekStart

  const supabase = await createClient()

  const [weeklyBudgetsResult, incomeResult, expensesResult, budgetsResult, categoriesResult] = await Promise.all([
    supabase.from('weekly_budgets').select('week_start, planned_amount'),
    supabase.from('income').select('occurred_on, amount'),
    supabase.from('expenses').select('occurred_on, amount, category_id, is_adjustment'),
    supabase.from('budgets').select('month, category_id, planned_amount'),
    supabase.from('categories').select('id, name, archived').order('name'),
  ])

  for (const result of [weeklyBudgetsResult, incomeResult, expensesResult, budgetsResult, categoriesResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const weeklyBudgets = weeklyBudgetsResult.data ?? []
  const income = incomeResult.data ?? []
  const expenses = expensesResult.data ?? []
  const budgets = budgetsResult.data ?? []
  const categories = categoriesResult.data ?? []

  const weekEnd = addDays(requestedWeek, 6)
  const plannedAmount = weeklyBudgets.find((w) => w.week_start === requestedWeek)?.planned_amount ?? null
  const spentSoFar = expenses
    .filter((e) => !e.is_adjustment && e.occurred_on >= requestedWeek && e.occurred_on <= weekEnd)
    .reduce((sum, e) => sum + e.amount, 0)
  const incomeThisWeek = income
    .filter((row) => row.occurred_on >= requestedWeek && row.occurred_on <= weekEnd)
    .reduce((sum, row) => sum + row.amount, 0)

  const nextWeekStart = addDays(currentWeekStart, 7)
  const nextWeekIsSet = weeklyBudgets.some((w) => w.week_start === nextWeekStart)
  const showReminder = requestedWeek === currentWeekStart && needsNextWeekReminder(today, currentWeekStart, nextWeekIsSet)

  const currentMonth = currentMonthInManila()
  const monthPrefix = currentMonth.slice(0, 7)
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const monthBudgets = budgets.filter((b) => b.month === currentMonth)
  const categoryBudgetRows = monthBudgets.map((b) => ({
    categoryId: b.category_id,
    categoryName: categoryNames.get(b.category_id) ?? 'Unknown',
    planned: b.planned_amount,
    actual: expenses
      .filter((e) => !e.is_adjustment && e.category_id === b.category_id && e.occurred_on.startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amount, 0),
  }))
  const budgetedCategoryIds = new Set(monthBudgets.map((b) => b.category_id))
  const unbudgetedCategories = categories.filter((c) => !c.archived && !budgetedCategoryIds.has(c.id))

  return (
    <div className="space-y-4">
      {showReminder && <ReminderBanner nextWeekStart={nextWeekStart} />}
      <WeeklyBudgetCard
        weekStart={requestedWeek}
        prevWeekStart={addDays(requestedWeek, -7)}
        nextWeekStart={addDays(requestedWeek, 7)}
        plannedAmount={plannedAmount}
        spentSoFar={spentSoFar}
        incomeThisWeek={incomeThisWeek}
        isPastWeek={requestedWeek < currentWeekStart}
      />
      <CategoryBudgetTable month={currentMonth} rows={categoryBudgetRows} unbudgetedCategories={unbudgetedCategories} />
    </div>
  )
}
```

- [ ] **Step 3: Manual browser verification**

With the dev server running and logged in, on `/budget`:

1. Expand "Per-category budgets (optional)". Confirm it lists every
   active category with an "Add" form and a placeholder amount input.
2. Add a planned amount for one category. Confirm it moves into the table
   above with planned/actual/difference columns (actual will read
   ₱0.00 unless real expense data exists for that category this month).
3. Click "Remove" on that row; confirm it disappears from the table and
   reappears in the unbudgeted list.
4. Delete any test `budgets` rows created via the Supabase dashboard
   table editor afterward.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/budget/CategoryBudgetTable.tsx" "app/(app)/budget/page.tsx"
git commit -m "Add optional per-category monthly budget table to the budget screen"
```

---

### Task 9: Recurring constants management UI

**Files:**
- Create: `app/(app)/budget/RecurringConstantForm.tsx`
- Create: `app/(app)/budget/RecurringConstantsList.tsx`
- Modify: `app/(app)/budget/page.tsx`

**Interfaces:**
- Consumes: `addRecurringConstant`, `updateRecurringConstant`,
  `setRecurringConstantActive`, `deleteRecurringConstant`,
  `RecurringConstantFormState` (Task 6); `formatCurrency`.
- Produces: the recurring-constants section on `/budget`, the final piece
  of this sub-project's UI.

- [ ] **Step 1: Write `RecurringConstantForm`**

Create `app/(app)/budget/RecurringConstantForm.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { addRecurringConstant, updateRecurringConstant, type RecurringConstantFormState } from './recurring-actions'

export type RecurringConstantRecord = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  frequency: 'monthly' | 'yearly'
  dayOfMonth: number
  monthOfYear: number | null
  accountId: string
  categoryId: string | null
  source: string | null
  notes: string | null
}

const initialState: RecurringConstantFormState = { error: null, submitted: false }

export function RecurringConstantForm({
  accounts,
  categories,
  editing,
  onDone,
}: {
  accounts: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
  editing: RecurringConstantRecord | null
  onDone: () => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>(editing?.kind ?? 'expense')
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>(editing?.frequency ?? 'monthly')
  const action = editing ? updateRecurringConstant.bind(null, editing.id) : addRecurringConstant
  const [state, formAction, pending] = useActionState(action, initialState)

  if (state.submitted && state.error === null) {
    onDone()
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind('expense')}
          disabled={!!editing}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            kind === 'expense' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setKind('income')}
          disabled={!!editing}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            kind === 'income' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Income
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />

      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        required
        defaultValue={editing?.amount}
        placeholder="Amount"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <select
        name="accountId"
        required
        defaultValue={editing?.accountId ?? ''}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Select an account
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {kind === 'expense' && (
        <select
          name="categoryId"
          required
          defaultValue={editing?.categoryId ?? ''}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {kind === 'income' && (
        <input
          name="source"
          type="text"
          required
          defaultValue={editing?.source ?? ''}
          placeholder="Source (e.g. Salary)"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFrequency('monthly')}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            frequency === 'monthly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setFrequency('yearly')}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            frequency === 'yearly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Yearly
        </button>
      </div>
      <input type="hidden" name="frequency" value={frequency} />

      <div className="flex gap-2">
        <input
          name="dayOfMonth"
          type="number"
          min="1"
          max="31"
          required
          defaultValue={editing?.dayOfMonth}
          placeholder="Day (1–31)"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {frequency === 'yearly' && (
          <input
            name="monthOfYear"
            type="number"
            min="1"
            max="12"
            required
            defaultValue={editing?.monthOfYear ?? undefined}
            placeholder="Month (1–12)"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        )}
      </div>

      <input
        name="notes"
        type="text"
        defaultValue={editing?.notes ?? ''}
        placeholder="Notes (e.g. Netflix)"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 rounded border border-slate-300 py-2 text-sm text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="flex-1 rounded bg-slate-900 py-2 text-sm text-white hover:bg-slate-700">
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Write `RecurringConstantsList`**

Create `app/(app)/budget/RecurringConstantsList.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { formatCurrency } from '@/lib/format'
import { setRecurringConstantActive, deleteRecurringConstant } from './recurring-actions'
import { RecurringConstantForm, type RecurringConstantRecord } from './RecurringConstantForm'

export function RecurringConstantsList({
  constants,
  accounts,
  categories,
}: {
  constants: RecurringConstantRecord[]
  accounts: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
}) {
  const [editingId, setEditingId] = useState<string | null | 'new'>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  function handleDelete(id: string) {
    if (!window.confirm('Delete this recurring constant? Past auto-posted transactions stay untouched.')) return
    setActionError(null)
    startTransition(async () => {
      try {
        await deleteRecurringConstant(id)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete.')
      }
    })
  }

  const editingRecord = editingId && editingId !== 'new' ? constants.find((c) => c.id === editingId) ?? null : null

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4" open>
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Recurring constants</summary>

      <div className="mt-3 space-y-2">
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}

        {constants.length === 0 && editingId !== 'new' && (
          <p className="text-sm text-slate-500">No recurring constants yet — add taxes, subscriptions, or salary below.</p>
        )}

        {constants.map((c) =>
          editingId === c.id ? (
            <RecurringConstantForm
              key={c.id}
              accounts={accounts}
              categories={categories}
              editing={c}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div key={c.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0">
              <div>
                <p className="text-sm font-medium text-slate-900">{c.notes ?? (c.kind === 'income' ? c.source : 'Expense')}</p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(c.amount)} · {c.frequency} · day {c.dayOfMonth}
                  {c.frequency === 'yearly' ? `/${c.monthOfYear}` : ''}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setEditingId(c.id)} className="text-slate-500 hover:text-slate-900">
                  Edit
                </button>
                <form action={setRecurringConstantActive.bind(null, c.id, false)}>
                  <button type="submit" className="text-slate-500 hover:text-slate-900">
                    Pause
                  </button>
                </form>
                <button type="button" onClick={() => handleDelete(c.id)} disabled={isPending} className="text-red-600 hover:text-red-800">
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {editingId === 'new' ? (
          <RecurringConstantForm accounts={accounts} categories={categories} editing={null} onDone={() => setEditingId(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditingId('new')}
            className="w-full rounded border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            + Add a recurring constant
          </button>
        )}
      </div>
    </details>
  )
}
```

Note: paused constants (`active = false`) are intentionally left out of
`constants` by how `page.tsx` queries in Step 3 below — there's no
"Resume" control in this list because paused ones aren't shown. This
matches the spec's scope (pause/delete stop future posts; nothing in the
spec calls for a "paused" view). If resuming a paused constant turns out
to be wanted later, add a `Show paused` toggle — YAGNI for now.

- [ ] **Step 3: Wire into `page.tsx`**

Modify `app/(app)/budget/page.tsx` — add the import, fetch
`recurring_constants` and `accounts`, map to `RecurringConstantRecord`,
and render the list:

```tsx
import { createClient } from '@/lib/supabase/server'
import { todayInManila, currentMonthInManila } from '@/lib/date'
import { mondayOfWeek, addDays, needsNextWeekReminder } from '@/lib/weekly-budget'
import { WeeklyBudgetCard } from './WeeklyBudgetCard'
import { ReminderBanner } from './ReminderBanner'
import { CategoryBudgetTable } from './CategoryBudgetTable'
import { RecurringConstantsList } from './RecurringConstantsList'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const params = await searchParams
  const today = todayInManila()
  const currentWeekStart = mondayOfWeek(today)
  const requestedWeek = params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? mondayOfWeek(params.week) : currentWeekStart

  const supabase = await createClient()

  const [weeklyBudgetsResult, incomeResult, expensesResult, budgetsResult, categoriesResult, accountsResult, recurringResult] =
    await Promise.all([
      supabase.from('weekly_budgets').select('week_start, planned_amount'),
      supabase.from('income').select('occurred_on, amount'),
      supabase.from('expenses').select('occurred_on, amount, category_id, is_adjustment'),
      supabase.from('budgets').select('month, category_id, planned_amount'),
      supabase.from('categories').select('id, name, archived').order('name'),
      supabase.from('accounts').select('id, name, archived').order('name'),
      supabase
        .from('recurring_constants')
        .select('id, kind, amount, frequency, day_of_month, month_of_year, account_id, category_id, source, notes')
        .eq('active', true)
        .order('created_at'),
    ])

  for (const result of [
    weeklyBudgetsResult,
    incomeResult,
    expensesResult,
    budgetsResult,
    categoriesResult,
    accountsResult,
    recurringResult,
  ]) {
    if (result.error) throw new Error(result.error.message)
  }

  const weeklyBudgets = weeklyBudgetsResult.data ?? []
  const income = incomeResult.data ?? []
  const expenses = expensesResult.data ?? []
  const budgets = budgetsResult.data ?? []
  const categories = categoriesResult.data ?? []
  const accounts = accountsResult.data ?? []
  const recurringConstants = (recurringResult.data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as 'expense' | 'income',
    amount: r.amount,
    frequency: r.frequency as 'monthly' | 'yearly',
    dayOfMonth: r.day_of_month,
    monthOfYear: r.month_of_year,
    accountId: r.account_id,
    categoryId: r.category_id,
    source: r.source,
    notes: r.notes,
  }))

  const weekEnd = addDays(requestedWeek, 6)
  const plannedAmount = weeklyBudgets.find((w) => w.week_start === requestedWeek)?.planned_amount ?? null
  const spentSoFar = expenses
    .filter((e) => !e.is_adjustment && e.occurred_on >= requestedWeek && e.occurred_on <= weekEnd)
    .reduce((sum, e) => sum + e.amount, 0)
  const incomeThisWeek = income
    .filter((row) => row.occurred_on >= requestedWeek && row.occurred_on <= weekEnd)
    .reduce((sum, row) => sum + row.amount, 0)

  const nextWeekStart = addDays(currentWeekStart, 7)
  const nextWeekIsSet = weeklyBudgets.some((w) => w.week_start === nextWeekStart)
  const showReminder = requestedWeek === currentWeekStart && needsNextWeekReminder(today, currentWeekStart, nextWeekIsSet)

  const currentMonth = currentMonthInManila()
  const monthPrefix = currentMonth.slice(0, 7)
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]))
  const monthBudgets = budgets.filter((b) => b.month === currentMonth)
  const categoryBudgetRows = monthBudgets.map((b) => ({
    categoryId: b.category_id,
    categoryName: categoryNames.get(b.category_id) ?? 'Unknown',
    planned: b.planned_amount,
    actual: expenses
      .filter((e) => !e.is_adjustment && e.category_id === b.category_id && e.occurred_on.startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amount, 0),
  }))
  const budgetedCategoryIds = new Set(monthBudgets.map((b) => b.category_id))
  const unbudgetedCategories = categories.filter((c) => !c.archived && !budgetedCategoryIds.has(c.id))
  const activeAccounts = accounts.filter((a) => !a.archived)
  const activeCategories = categories.filter((c) => !c.archived)

  return (
    <div className="space-y-4">
      {showReminder && <ReminderBanner nextWeekStart={nextWeekStart} />}
      <WeeklyBudgetCard
        weekStart={requestedWeek}
        prevWeekStart={addDays(requestedWeek, -7)}
        nextWeekStart={addDays(requestedWeek, 7)}
        plannedAmount={plannedAmount}
        spentSoFar={spentSoFar}
        incomeThisWeek={incomeThisWeek}
        isPastWeek={requestedWeek < currentWeekStart}
      />
      <CategoryBudgetTable month={currentMonth} rows={categoryBudgetRows} unbudgetedCategories={unbudgetedCategories} />
      <RecurringConstantsList constants={recurringConstants} accounts={activeAccounts} categories={activeCategories} />
    </div>
  )
}
```

- [ ] **Step 4: Manual browser verification**

With the dev server running and logged in, on `/budget`:

1. Expand "Recurring constants", click "+ Add a recurring constant".
   Add a monthly expense (e.g. amount 549, an existing category/account,
   day 15, notes "Netflix"). Confirm it appears in the list with the
   right summary line.
2. Click "Edit" on it, change the amount, save. Confirm the list reflects
   the new amount.
3. Click "Pause". Confirm it disappears from the list (paused constants
   are hidden per Step 2's note).
4. In the Supabase dashboard table editor, set `active = true` again on
   that row (there's no UI for un-pausing yet — YAGNI, noted above),
   confirm it reappears on reload, then click "Delete" and confirm the
   browser's confirm dialog appears and, once accepted, the row is gone
   from both the UI and (checking the table editor) the database.
5. Add an income constant (e.g. "Salary", yearly, month 1, day 15) to
   confirm the kind/frequency conditional fields (source instead of
   category, a month field for yearly) all render and submit correctly.
   Delete it afterward.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/budget/RecurringConstantForm.tsx" "app/(app)/budget/RecurringConstantsList.tsx" "app/(app)/budget/page.tsx"
git commit -m "Add recurring constants management UI to the budget screen"
```

---

### Task 10: Dashboard weekly-budget-pace insight

**Files:**
- Modify: `lib/insights.ts`
- Modify: `lib/insights.test.ts`
- Modify: `app/(app)/dashboard/InsightsPanel.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `mondayOfWeek`, `addDays` (Task 2, `lib/weekly-budget.ts`).
- Produces: a new `Insight` variant, `{ kind: 'weekly-budget-pace';
  spentSoFar: number; projected: number; budget: number }`, and
  `InsightWeeklyBudgetRow = { weekStart: string; plannedAmount: number }`
  added to `ComputeInsightsInput` as an optional field (existing tests in
  `lib/insights.test.ts` call `computeInsights` without it in ~15 places;
  making it optional with a `[]` default avoids editing every one of
  them, while `dashboard/page.tsx`, the only real caller, always passes
  it explicitly).

- [ ] **Step 1: Write the failing tests**

Edit `lib/insights.test.ts` — add the import and a new `describe` block
at the end of the file (after the existing `computeInsights — overall`
block):

```ts
import { describe, it, expect } from 'vitest'
import {
  computeInsights,
  type InsightExpenseRow,
  type InsightAccount,
  type InsightBudgetRow,
  type InsightWeeklyBudgetRow,
} from './insights'
```

(replaces the existing import line at the top of the file)

```ts
describe('computeInsights — weekly-budget-pace', () => {
  it('reports pacing under budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-18', amount: 400 })] // Tue of the Aug 17-23 week, day 2 of 7
    const weeklyBudgets: InsightWeeklyBudgetRow[] = [{ weekStart: '2026-08-17', plannedAmount: 3000 }]
    const insights = computeInsights({
      expenses,
      categoryNames,
      accounts: [],
      budgets: [],
      weeklyBudgets,
      referenceDate: reference,
    })
    const found = insights.find((i) => i.kind === 'weekly-budget-pace')
    expect(found).toMatchObject({ kind: 'weekly-budget-pace', spentSoFar: 400, budget: 3000 })
    if (found?.kind === 'weekly-budget-pace') expect(found.projected).toBeLessThan(found.budget)
  })

  it('reports pacing over budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-18', amount: 2000 })]
    const weeklyBudgets: InsightWeeklyBudgetRow[] = [{ weekStart: '2026-08-17', plannedAmount: 3000 }]
    const insights = computeInsights({
      expenses,
      categoryNames,
      accounts: [],
      budgets: [],
      weeklyBudgets,
      referenceDate: reference,
    })
    const found = insights.find((i) => i.kind === 'weekly-budget-pace')
    if (found?.kind === 'weekly-budget-pace') expect(found.projected).toBeGreaterThan(found.budget)
    else throw new Error('expected a weekly-budget-pace insight')
  })

  it('is omitted when there is no weekly budget row for the current week', () => {
    const expenses = [expense({ occurredOn: '2026-08-18', amount: 100 })]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'weekly-budget-pace')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/insights.test.ts`
Expected: FAIL — `InsightWeeklyBudgetRow` isn't exported yet, and the new
`describe` block's insight is never found.

- [ ] **Step 3: Implement the insight**

Edit `lib/insights.ts` — add the import, the new type, the new `Insight`
variant, the `weeklyBudgets` field, the rule function, and wire it into
`computeInsights`:

```ts
import { currentMonthInManila, monthsAgoInManila, todayInManila } from './date'
import { mondayOfWeek, addDays } from './weekly-budget'
```

(replaces the existing single-line import at the top of the file)

```ts
export type InsightWeeklyBudgetRow = {
  weekStart: string
  plannedAmount: number
}
```

(add alongside the existing `InsightBudgetRow` type)

```ts
export type Insight =
  | { kind: 'highest-spend-month'; month: string; monthTotal: number; topLabel: string; topAmount: number }
  | { kind: 'budget-pace'; spentSoFar: number; projected: number; budget: number }
  | { kind: 'top-category'; categoryName: string; toppedMonths: number; windowMonths: number; averagePerMonth: number }
  | { kind: 'dormant-account'; accountName: string; daysSinceActivity: number }
  | { kind: 'months-under-budget'; underCount: number; consideredCount: number }
  | { kind: 'weekly-budget-pace'; spentSoFar: number; projected: number; budget: number }
```

(replaces the existing `Insight` union)

```ts
export type ComputeInsightsInput = {
  expenses: InsightExpenseRow[]
  categoryNames: Record<string, string>
  accounts: InsightAccount[]
  budgets: InsightBudgetRow[]
  weeklyBudgets?: InsightWeeklyBudgetRow[]
  referenceDate?: Date
}
```

(replaces the existing `ComputeInsightsInput` type)

```ts
function weeklyBudgetPace(
  expenses: InsightExpenseRow[],
  weeklyBudgets: InsightWeeklyBudgetRow[],
  referenceDate: Date
): Insight | null {
  const today = todayInManila(referenceDate)
  const currentWeekStart = mondayOfWeek(today)
  const budget = weeklyBudgets.find((w) => w.weekStart === currentWeekStart)?.plannedAmount
  if (!budget) return null

  const weekEnd = addDays(currentWeekStart, 6)
  const spentSoFar = expenses
    .filter((e) => !e.isAdjustment && e.occurredOn >= currentWeekStart && e.occurredOn <= weekEnd)
    .reduce((sum, e) => sum + e.amount, 0)

  const dayOfWeek = daysBetween(currentWeekStart, today) + 1 // 1..7
  const projected = (spentSoFar / dayOfWeek) * 7

  return { kind: 'weekly-budget-pace', spentSoFar, projected, budget }
}
```

(add alongside the existing `budgetPace` function)

```ts
export function computeInsights(input: ComputeInsightsInput): Insight[] {
  const referenceDate = input.referenceDate ?? new Date()
  const monthKeys = completeMonthWindow(referenceDate)

  const results = [
    highestSpendMonth(input.expenses, monthKeys, input.categoryNames),
    budgetPace(input.expenses, input.budgets, referenceDate),
    topRecurringCategory(input.expenses, monthKeys, input.categoryNames),
    dormantAccount(input.accounts, referenceDate),
    monthsUnderBudget(input.expenses, input.budgets, monthKeys),
    weeklyBudgetPace(input.expenses, input.weeklyBudgets ?? [], referenceDate),
  ]

  return results.filter((insight): insight is Insight => insight !== null)
}
```

(replaces the existing `computeInsights` function)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/insights.test.ts`
Expected: PASS, all tests green (existing tests keep passing unchanged
since `weeklyBudgets` is optional).

- [ ] **Step 5: Render it in `InsightsPanel`**

Edit `app/(app)/dashboard/InsightsPanel.tsx` — add a mark and a
`describe` case:

```ts
const MARKS: Record<Insight['kind'], string> = {
  'highest-spend-month': '“',
  'budget-pace': '↗',
  'top-category': '★',
  'dormant-account': '–',
  'months-under-budget': '✓',
  'weekly-budget-pace': '◆',
}
```

(replaces the existing `MARKS` object)

```ts
    case 'weekly-budget-pace': {
      const pacing = insight.projected <= insight.budget ? 'under' : 'over'
      return (
        <>
          You&rsquo;re pacing <strong>{pacing} budget</strong> this week —{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.spentSoFar)}</span> spent so far, projected to
          land near <span className="font-ledger-mono">{formatCurrency(insight.projected)}</span> against a{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.budget)}</span> weekly budget.
        </>
      )
    }
```

(add this `case` inside the existing `describe` function's `switch`,
alongside the other cases, before the closing brace)

- [ ] **Step 6: Wire the data into `dashboard/page.tsx`**

Edit `app/(app)/dashboard/page.tsx`:

```ts
  const [accountsResult, categoriesResult, incomeResult, expensesResult, budgetsResult, portfolioResult, weeklyBudgetsResult] =
    await Promise.all([
      supabase.from('accounts').select('id, name, archived').order('name'),
      supabase.from('categories').select('id, name'),
      supabase.from('income').select('occurred_on, amount, account_id, is_adjustment'),
      supabase.from('expenses').select('occurred_on, amount, account_id, category_id, notes, is_adjustment'),
      supabase.from('budgets').select('month, planned_amount'),
      supabase.from('portfolio_transactions').select('type, ticker, company, amount'),
      supabase.from('weekly_budgets').select('week_start, planned_amount'),
    ])

  for (const result of [accountsResult, categoriesResult, incomeResult, expensesResult, budgetsResult, portfolioResult, weeklyBudgetsResult]) {
    if (result.error) throw new Error(result.error.message)
  }
```

(replaces the existing `Promise.all` destructure and error-check loop)

```ts
  const insightWeeklyBudgets: InsightWeeklyBudgetRow[] = (weeklyBudgetsResult.data ?? []).map((w) => ({
    weekStart: w.week_start,
    plannedAmount: w.planned_amount,
  }))

  const insights = computeInsights({
    expenses: insightExpenses,
    categoryNames,
    accounts: insightAccounts,
    budgets: insightBudgets,
    weeklyBudgets: insightWeeklyBudgets,
  })
```

(replaces the existing `computeInsights` call; add the
`insightWeeklyBudgets` mapping immediately before it, and add
`InsightWeeklyBudgetRow` to the existing `import { computeInsights,
type InsightAccount, type InsightExpenseRow, type InsightBudgetRow }
from '@/lib/insights'` line)

- [ ] **Step 7: Manual browser verification**

With a weekly budget set for the current week (from Task 7's
verification, or set one now on `/budget`), load `/dashboard`. Confirm
"What stood out" now includes a weekly-budget-pace line reading
correctly under/over. Remove the weekly budget (via the Supabase
dashboard) and reload; confirm the line disappears without breaking the
rest of the panel.

- [ ] **Step 8: Commit**

```bash
git add lib/insights.ts lib/insights.test.ts "app/(app)/dashboard/InsightsPanel.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "Add weekly-budget-pace insight to the dashboard"
```

---

### Task 11: Final regression pass

**Files:** none (verification only; commit only if a bug is found and fixed)

**Interfaces:** none

- [ ] **Step 1: Full test suite and type check**

Run: `npm test`
Expected: every test file passes, including `lib/weekly-budget.test.ts`,
`lib/recurring.test.ts`, and the updated `lib/insights.test.ts`.

Run: `npx next typegen && npx tsc --noEmit`
Expected: no errors (the `next typegen` step is required once per fresh
worktree per `docs/superpowers/PROGRESS.md`).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Full end-to-end walkthrough**

With the dev server running and logged in:

1. On `/budget`, set the current week's budget, confirm the headline
   number, derived monthly/daily figures, and income/leftover line all
   render correctly against real account data.
2. Add one per-category budget and one recurring constant (expense and
   income, one each). Confirm both sections work together on the same
   page without visual collision (the weekly card should still read as
   clearly primary — larger type, top of the page).
3. Confirm the reminder banner logic by temporarily checking behavior
   near a week boundary (or by reasoning through `needsNextWeekReminder`
   with today's actual date — no need to wait for a real Friday if
   today isn't one).
4. On `/dashboard`, confirm the new weekly-budget-pace insight appears
   alongside the existing five.
5. Delete every test row created in this step (weekly_budgets, budgets,
   recurring_constants, and any auto-posted income/expenses from them)
   via the Supabase dashboard table editor. Confirm `/budget` and
   `/dashboard` both return to their empty states afterward.

- [ ] **Step 3: Mobile viewport check**

Resize the browser preview to the "mobile" preset. Reload `/budget`.
Confirm the weekly budget card, category table, and recurring constants
list all stay within the viewport width (no horizontal scroll), and the
bottom nav's "Budget" tab still reads as active.

- [ ] **Step 4: Take a screenshot for the record**

Use the browser tool's screenshot action on `/budget` at mobile viewport
size as visual confirmation this phase is complete.

- [ ] **Step 5: Update progress notes**

Edit `docs/superpowers/PROGRESS.md`: change the "Budgeting" bullet under
"Sub-projects 1–3: shipped" (renumber the section heading to "1–3" → "1–3
+ 2" or fold Budgeting's line into that section, matching how prior
sub-projects were marked) to "✅ COMPLETE", summarizing what shipped in
the same style as the Transactions core / Dashboard & Insights entries.
Update "Next steps to complete the app" and "How to resume in a new
session" to point at sub-project 4 (Portfolio) as the next step. Keep the
file under 300 lines — prune older completed detail if needed to make
room, per the file's own stated convention.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/PROGRESS.md
git commit -m "Update progress notes: Budgeting complete"
```

(If Step 1, 2, or 3 surfaced a real bug, fix it, re-verify, and commit
that fix as its own commit before this one.)
