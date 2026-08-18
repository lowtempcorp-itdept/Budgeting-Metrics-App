# Transactions Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship fast, low-friction income/expense entry (a quick-add sheet reachable from every screen), a filterable Transactions list, and an Accounts & Categories admin screen — replacing three of the five placeholder screens with the real daily-use core of the app.

**Architecture:** A client-side quick-add bottom sheet (React Context + a floating "+") submits through Server Actions, following the same pattern already used for login/logout in this codebase — no new routing concepts. Account balances and category-usage ranking are computed from transaction data via small pure functions, unit-tested in isolation from the framework. All three screens share one additive schema migration.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19 (Server Actions, `useActionState`), Tailwind CSS, Supabase (Postgres + RLS), Vitest.

This is sub-project 1 of 5 in the post-foundation UI work (see
`docs/superpowers/specs/2026-08-18-transactions-core-design.md` §7 for the
full sequence: Transactions core → Budgeting → Dashboard & Insights →
Portfolio → Historical migration). It replaces the `transactions` and
`accounts` placeholder pages and adds the quick-add sheet used everywhere.
Dashboard, Budget, and Portfolio stay placeholders — later plans.

## Global Constraints

- Next.js App Router + TypeScript only — no plain JavaScript files.
- Tailwind CSS for all styling — no separate CSS modules or styled-components.
- Every Supabase table already has Row-Level Security with owner-only
  (`auth.uid() = user_id`) policies. This plan adds columns to existing
  tables, not new tables — no new policies are needed, but nothing may
  weaken the existing ones.
- All money values are displayed via the shared `formatCurrency` helper
  (`lib/format.ts`) — never format currency ad hoc.
- `SUPABASE_SERVICE_ROLE_KEY` must never be imported into any file under
  `app/`, `lib/`, or `proxy.ts` — only scripts under `scripts/` read it.
- **Amount sign convention:** every amount column is always positive;
  direction is implied by table/type, enforced by `check (amount > 0)`.
  Never store or accept a negative amount.
- **Account balances are computed from transactions at query time, never
  stored.** Reconciling a counted balance against the computed one happens
  via a normal income/expense row with `is_adjustment = true`, not a
  separate balance field or table.
- **Date defaults** ("today", "current month") are computed in
  `Asia/Manila` local time via the `lib/date.ts` helpers built in Task 2 —
  never via a naive server `Date()`. The server runs in UTC; Manila is
  UTC+8, so naive UTC dates land on the wrong calendar day for roughly a
  third of the day.
- No offline queueing for the quick-add sheet — a failed submit keeps
  whatever was typed and shows a retryable inline error.
- **There is only one Supabase environment for this app — the live
  production project.** Any manual verification step that creates data
  through the UI must delete that data through the UI afterward (this
  also happens to exercise the delete path). Never leave test rows behind.

---

### Task 1: Schema migration — resolve deferred decisions, add adjustment flag

**Files:**
- Create: `supabase/migrations/0004_transactions_core.sql`
- Create: `scripts/verify-transactions-core-migration.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SEED_USER_EMAIL` env vars (all already in
  `.env.local` per `docs/superpowers/PROGRESS.md`).
- Produces: `accounts.archived boolean`, `income.is_adjustment boolean`,
  `expenses.is_adjustment boolean`, nullable `expenses.category_id`, and
  `check (amount > 0)` constraints on `income.amount`, `expenses.amount`,
  `budgets.planned_amount`, `portfolio_transactions.amount` — consumed by
  every later task in this plan.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-transactions-core-migration.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const userEmail = process.env.SEED_USER_EMAIL!

const anon = createClient(url, anonKey)
const admin = createClient(url, serviceRoleKey)

let failures = 0

// 1. Confirm the new columns exist. A `select` with `limit(0)` is validated
// against the schema before RLS ever runs, so an anon client is safe here:
// an unknown column errors regardless of RLS, and a known column returns
// `{ data: [], error: null }` because RLS blocks anonymous rows.
const columnChecks: Array<[string, string]> = [
  ['accounts', 'archived'],
  ['income', 'is_adjustment'],
  ['expenses', 'is_adjustment'],
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
// expected to FAIL, so nothing is left behind — no cleanup needed. Uses the
// service role so a check-constraint violation is what's under test, not an
// RLS policy.
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

const { error: negativeIncomeError } = await admin.from('income').insert({
  user_id: user.id,
  occurred_on: '2026-01-01',
  amount: -1,
  source: 'schema verification (should be rejected)',
  account_id: anAccount.id,
})
if (negativeIncomeError?.code === CHECK_VIOLATION) {
  console.log('income.amount check constraint: OK (rejected a negative amount)')
} else {
  console.log(
    `income.amount check constraint: FAIL — expected a check violation, got ${JSON.stringify(negativeIncomeError)}`
  )
  failures++
}

const { error: missingCategoryError } = await admin.from('expenses').insert({
  user_id: user.id,
  occurred_on: '2026-01-01',
  amount: 1,
  account_id: anAccount.id,
  category_id: null,
  is_adjustment: false,
})
if (missingCategoryError?.code === CHECK_VIOLATION) {
  console.log(
    'expenses category-required-unless-adjustment check: OK (rejected a non-adjustment expense with no category)'
  )
} else {
  console.log(
    `expenses category-required-unless-adjustment check: FAIL — expected a check violation, got ${JSON.stringify(missingCategoryError)}`
  )
  failures++
}

if (failures > 0) {
  throw new Error(`${failures} check(s) failed verification`)
}

console.log('All transactions-core migration checks verified.')
```

- [ ] **Step 2: Run it before the migration exists (expect FAILures)**

Run: `npx tsx --env-file=.env.local scripts/verify-transactions-core-migration.ts`
Expected: the column checks and constraint checks report `FAIL` (columns
don't exist yet; a negative amount and a categoryless expense both insert
successfully since the constraints don't exist yet), and the script exits
non-zero. This confirms the script is actually testing something.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0004_transactions_core.sql`:

```sql
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
```

- [ ] **Step 4: Apply the migration (manual)**

In the Supabase dashboard, go to **SQL Editor → New query**, paste the full
contents of `supabase/migrations/0004_transactions_core.sql`, and click
**Run**.
Expected: "Success. No rows returned."

- [ ] **Step 5: Run the verification script again (expect all OK)**

Run: `npx tsx --env-file=.env.local scripts/verify-transactions-core-migration.ts`
Expected: every line prints `OK`, then `All transactions-core migration
checks verified.`, exiting 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_transactions_core.sql scripts/verify-transactions-core-migration.ts
git commit -m "Add transactions-core schema: amount sign convention, archived accounts, balance adjustments"
```

---

### Task 2: Manila-timezone date helpers

**Files:**
- Create: `lib/date.ts`
- Test: `lib/date.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `todayInManila(referenceDate?: Date): string` (returns
  `YYYY-MM-DD`) and `currentMonthInManila(referenceDate?: Date): string`
  (returns `YYYY-MM-01`), both from `lib/date.ts` — used by the quick-add
  sheet (Task 5, for the date field's default) and the transactions list
  (Task 8, for the default month filter).

- [ ] **Step 1: Write the failing tests**

Create `lib/date.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { todayInManila, currentMonthInManila } from './date'

describe('todayInManila', () => {
  it('returns the Manila calendar date, one day ahead of a UTC date that has not rolled over yet', () => {
    // 2026-08-18T17:00:00Z is 2026-08-19T01:00:00 in Asia/Manila (UTC+8) —
    // this is exactly the class of bug this helper exists to prevent.
    const reference = new Date('2026-08-18T17:00:00Z')
    expect(todayInManila(reference)).toBe('2026-08-19')
  })

  it('matches the UTC date when well within the Manila day', () => {
    const reference = new Date('2026-08-18T02:00:00Z') // 10:00 in Manila
    expect(todayInManila(reference)).toBe('2026-08-18')
  })

  it('defaults to the current instant when no reference date is given', () => {
    expect(todayInManila()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('currentMonthInManila', () => {
  it('returns the 1st of the Manila calendar month', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(currentMonthInManila(reference)).toBe('2026-08-01')
  })

  it('rolls over to the next month at the Manila month boundary, ahead of UTC', () => {
    // 2026-08-31T17:00:00Z is 2026-09-01T01:00:00 in Asia/Manila.
    const reference = new Date('2026-08-31T17:00:00Z')
    expect(currentMonthInManila(reference)).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/date.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/date.ts`:

```ts
export function todayInManila(referenceDate: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the format Postgres
  // `date` columns and HTML `<input type="date">` both expect.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate)
}

export function currentMonthInManila(referenceDate: Date = new Date()): string {
  return `${todayInManila(referenceDate).slice(0, 7)}-01`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 5 assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/date.ts lib/date.test.ts
git commit -m "Add Asia/Manila date helpers for quick-add and transaction filter defaults"
```

---

### Task 3: Account balance and category-ranking logic

**Files:**
- Create: `lib/transactions.ts`
- Test: `lib/transactions.test.ts`

**Interfaces:**
- Consumes: none
- Produces (all from `lib/transactions.ts`):
  - `type AmountRow = { accountId: string; amount: number }`
  - `computeAccountBalances(accountIds: string[], income: AmountRow[], expenses: AmountRow[]): Record<string, number>` — used by the Accounts page (Task 7).
  - `type DatedAccountUse = { accountId: string; createdAt: string }`
  - `mostRecentAccountId(uses: DatedAccountUse[]): string | null` — used by the layout (Task 6) to default the quick-add account picker.
  - `rankCategoriesByUsage(categoryIds: string[]): string[]` — used by the layout (Task 6) to order the quick-add category chips.

- [ ] **Step 1: Write the failing tests**

Create `lib/transactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeAccountBalances, mostRecentAccountId, rankCategoriesByUsage } from './transactions'

describe('computeAccountBalances', () => {
  it('sums income minus expenses per account', () => {
    const balances = computeAccountBalances(
      ['acc-1', 'acc-2'],
      [
        { accountId: 'acc-1', amount: 1000 },
        { accountId: 'acc-1', amount: 500 },
      ],
      [
        { accountId: 'acc-1', amount: 200 },
        { accountId: 'acc-2', amount: 50 },
      ]
    )
    expect(balances).toEqual({ 'acc-1': 1300, 'acc-2': -50 })
  })

  it('returns zero for an account with no transactions', () => {
    expect(computeAccountBalances(['acc-1'], [], [])).toEqual({ 'acc-1': 0 })
  })

  it('includes balance-adjustment rows in the sum like any other transaction', () => {
    // Adjustments are just income/expense rows with is_adjustment=true —
    // this function doesn't need to know about that flag; the caller
    // already decided which rows to include.
    const balances = computeAccountBalances(['acc-1'], [{ accountId: 'acc-1', amount: 100 }], [])
    expect(balances).toEqual({ 'acc-1': 100 })
  })
})

describe('mostRecentAccountId', () => {
  it('returns null when there are no transactions', () => {
    expect(mostRecentAccountId([])).toBeNull()
  })

  it('returns the account of the most recently created transaction', () => {
    const result = mostRecentAccountId([
      { accountId: 'acc-1', createdAt: '2026-08-01T10:00:00Z' },
      { accountId: 'acc-2', createdAt: '2026-08-10T10:00:00Z' },
      { accountId: 'acc-1', createdAt: '2026-08-05T10:00:00Z' },
    ])
    expect(result).toBe('acc-2')
  })
})

describe('rankCategoriesByUsage', () => {
  it('ranks categories by descending frequency', () => {
    const result = rankCategoriesByUsage(['coffee', 'food', 'coffee', 'coffee', 'food'])
    expect(result).toEqual(['coffee', 'food'])
  })

  it('breaks ties by first appearance', () => {
    const result = rankCategoriesByUsage(['food', 'coffee'])
    expect(result).toEqual(['food', 'coffee'])
  })

  it('returns an empty array for no usage', () => {
    expect(rankCategoriesByUsage([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/transactions.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `lib/transactions.ts`:

```ts
export type AmountRow = { accountId: string; amount: number }

export function computeAccountBalances(
  accountIds: string[],
  income: AmountRow[],
  expenses: AmountRow[]
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const id of accountIds) balances[id] = 0
  for (const row of income) {
    balances[row.accountId] = (balances[row.accountId] ?? 0) + row.amount
  }
  for (const row of expenses) {
    balances[row.accountId] = (balances[row.accountId] ?? 0) - row.amount
  }
  return balances
}

export type DatedAccountUse = { accountId: string; createdAt: string }

export function mostRecentAccountId(uses: DatedAccountUse[]): string | null {
  if (uses.length === 0) return null
  // ISO 8601 timestamp strings sort lexicographically in chronological order.
  return uses.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest))
    .accountId
}

export function rankCategoriesByUsage(categoryIds: string[]): string[] {
  const counts = new Map<string, number>()
  const order: string[] = []
  for (const id of categoryIds) {
    if (!counts.has(id)) {
      counts.set(id, 0)
      order.push(id)
    }
    counts.set(id, counts.get(id)! + 1)
  }
  // Array.prototype.sort is a stable sort (guaranteed since ES2019), so
  // equal-count ties keep their original first-appearance order.
  return order.sort((a, b) => counts.get(b)! - counts.get(a)!)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions.ts lib/transactions.test.ts
git commit -m "Add account balance and category-usage ranking logic"
```

---

### Task 4: Quick-add types and Server Actions

**Files:**
- Create: `app/(app)/quick-add/types.ts`
- Create: `app/(app)/quick-add/actions.ts`

**Interfaces:**
- Consumes: `lib/supabase/server.ts`'s `createClient()`, the schema from
  Task 1.
- Produces (from `app/(app)/quick-add/types.ts`):
  - `type TransactionKind = 'income' | 'expense'`
  - `type AccountOption = { id: string; name: string; archived: boolean }`
  - `type CategoryOption = { id: string; name: string; archived: boolean }`
  - `type TransactionRecord = { id: string; kind: TransactionKind; occurredOn: string; amount: number; accountId: string; notes: string | null; isAdjustment: boolean; source?: string; categoryId?: string | null }`
- Produces (from `app/(app)/quick-add/actions.ts`):
  - `type TransactionFormState = { error: string | null; submitted: boolean }`
  - `createTransaction(prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState>`
  - `updateTransaction(id: string, kind: TransactionKind, prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState>`
  - `deleteTransaction(id: string, kind: TransactionKind): Promise<void>`
  - All three are consumed by the quick-add sheet UI (Task 5).

Server Actions depend on `next/headers`' request context and can't run
outside Next's server runtime, so there's no meaningful way to unit-test
them the way Tasks 2–3's pure functions were tested — this matches the
design spec's testing plan, which reserves unit tests for the
framework-independent money math. This task is verified by type-checking
here, and functionally in Task 6's manual browser check once the sheet UI
can actually call these actions.

- [ ] **Step 1: Write the shared types**

Create `app/(app)/quick-add/types.ts`:

```ts
export type TransactionKind = 'income' | 'expense'

export type AccountOption = {
  id: string
  name: string
  archived: boolean
}

export type CategoryOption = {
  id: string
  name: string
  archived: boolean
}

export type TransactionRecord = {
  id: string
  kind: TransactionKind
  occurredOn: string
  amount: number
  accountId: string
  notes: string | null
  isAdjustment: boolean
  // income only
  source?: string
  // expense only
  categoryId?: string | null
}
```

- [ ] **Step 2: Write the Server Actions**

Create `app/(app)/quick-add/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TransactionKind } from './types'

export type TransactionFormState = {
  error: string | null
  submitted: boolean
}

type ParsedFields =
  | {
      ok: true
      kind: 'income'
      occurredOn: string
      amount: number
      accountId: string
      source: string
      notes: string | null
    }
  | {
      ok: true
      kind: 'expense'
      occurredOn: string
      amount: number
      accountId: string
      categoryId: string | null
      isAdjustment: boolean
      notes: string | null
    }
  | { ok: false; error: string }

function parseFields(kind: TransactionKind, formData: FormData): ParsedFields {
  const occurredOn = formData.get('occurredOn')
  const amountRaw = formData.get('amount')
  const accountId = formData.get('accountId')
  const notesRaw = formData.get('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null

  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }
  if (typeof occurredOn !== 'string' || occurredOn.length === 0) {
    return { ok: false, error: 'Date is required.' }
  }
  if (typeof accountId !== 'string' || accountId.length === 0) {
    return { ok: false, error: 'Account is required.' }
  }

  if (kind === 'income') {
    const source = formData.get('source')
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { ok: false, error: 'Source is required for income.' }
    }
    return { ok: true, kind: 'income', occurredOn, amount, accountId, source: source.trim(), notes }
  }

  const isAdjustment = formData.get('isAdjustment') === 'on'
  const categoryIdRaw = formData.get('categoryId')
  const categoryId = typeof categoryIdRaw === 'string' && categoryIdRaw.length > 0 ? categoryIdRaw : null
  if (!isAdjustment && categoryId === null) {
    return { ok: false, error: 'Category is required unless this is a balance adjustment.' }
  }
  return { ok: true, kind: 'expense', occurredOn, amount, accountId, categoryId, isAdjustment, notes }
}

function buildPayload(parsed: Extract<ParsedFields, { ok: true }>) {
  if (parsed.kind === 'income') {
    return {
      table: 'income' as const,
      payload: {
        occurred_on: parsed.occurredOn,
        amount: parsed.amount,
        account_id: parsed.accountId,
        source: parsed.source,
        notes: parsed.notes,
      },
    }
  }
  return {
    table: 'expenses' as const,
    payload: {
      occurred_on: parsed.occurredOn,
      amount: parsed.amount,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      is_adjustment: parsed.isAdjustment,
      notes: parsed.notes,
    },
  }
}

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const kindRaw = formData.get('kind')
  const kind: TransactionKind = kindRaw === 'income' ? 'income' : 'expense'
  const parsed = parseFields(kind, formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const { table, payload } = buildPayload(parsed)
  const { error } = await supabase.from(table).insert(payload)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  return { error: null, submitted: true }
}

export async function updateTransaction(
  id: string,
  kind: TransactionKind,
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(kind, formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const { table, payload } = buildPayload(parsed)
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  return { error: null, submitted: true }
}

export async function deleteTransaction(id: string, kind: TransactionKind): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const table = kind === 'income' ? 'income' : 'expenses'
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/transactions')
  revalidatePath('/accounts')
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/quick-add/types.ts" "app/(app)/quick-add/actions.ts"
git commit -m "Add quick-add transaction types and Server Actions"
```

---

### Task 5: Quick-add sheet UI

**Files:**
- Create: `app/(app)/quick-add/QuickAddSheet.tsx`
- Create: `app/(app)/quick-add/QuickAddProvider.tsx`

**Interfaces:**
- Consumes: `createTransaction`, `updateTransaction`, `deleteTransaction`,
  `TransactionFormState` from Task 4's `actions.ts`; `TransactionKind`,
  `AccountOption`, `CategoryOption`, `TransactionRecord` from Task 4's
  `types.ts`; `todayInManila` from Task 2's `lib/date.ts`.
- Produces (from `app/(app)/quick-add/QuickAddProvider.tsx`):
  - `QuickAddProvider({ children, accounts, categories, defaultAccountId, rankedCategoryIds }: { children: ReactNode; accounts: AccountOption[]; categories: CategoryOption[]; defaultAccountId: string | null; rankedCategoryIds: string[] }): JSX.Element`
  - `useQuickAdd(): { openCreate: () => void; openEdit: (transaction: TransactionRecord) => void }` —
    consumed by the layout (Task 6, for the FAB — already built in) and the
    Transactions list (Task 8, for tap-to-edit).

- [ ] **Step 1: Write the sheet component**

Create `app/(app)/quick-add/QuickAddSheet.tsx`:

```tsx
'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { createTransaction, updateTransaction, deleteTransaction } from './actions'
import type {
  AccountOption,
  CategoryOption,
  TransactionKind,
  TransactionRecord,
} from './types'
import { todayInManila } from '@/lib/date'

const initialState = { error: null as string | null, submitted: false }

export function QuickAddSheet({
  accounts,
  categories,
  defaultAccountId,
  rankedCategoryIds,
  editing,
  onClose,
}: {
  accounts: AccountOption[]
  categories: CategoryOption[]
  defaultAccountId: string | null
  rankedCategoryIds: string[]
  editing: TransactionRecord | null
  onClose: () => void
}) {
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? 'expense')
  const [isAdjustment, setIsAdjustment] = useState(editing?.isAdjustment ?? false)
  const action = editing ? updateTransaction.bind(null, editing.id, editing.kind) : createTransaction
  const [state, formAction, pending] = useActionState(action, initialState)
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    if (state.submitted && state.error === null) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const activeAccounts = accounts.filter((a) => !a.archived || a.id === editing?.accountId)
  const activeCategories = categories.filter((c) => !c.archived || c.id === editing?.categoryId)
  const orderedCategories = [
    ...rankedCategoryIds
      .map((id) => activeCategories.find((c) => c.id === id))
      .filter((c): c is CategoryOption => c !== undefined),
    ...activeCategories.filter((c) => !rankedCategoryIds.includes(c.id)),
  ]

  function handleDelete() {
    if (!editing) return
    if (!window.confirm('Delete this transaction?')) return
    startDeleteTransition(async () => {
      await deleteTransaction(editing.id, editing.kind)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="w-full space-y-4 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind('expense')}
            disabled={!!editing}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              kind === 'expense' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setKind('income')}
            disabled={!!editing}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              kind === 'income' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Income
          </button>
        </div>
        <input type="hidden" name="kind" value={kind} />

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={editing?.amount}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="occurredOn" className="block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            id="occurredOn"
            name="occurredOn"
            type="date"
            required
            defaultValue={editing?.occurredOn ?? todayInManila()}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-slate-700">
            Account
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue={editing?.accountId ?? defaultAccountId ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Select an account
            </option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {kind === 'income' && (
          <div>
            <label htmlFor="source" className="block text-sm font-medium text-slate-700">
              Source
            </label>
            <input
              id="source"
              name="source"
              type="text"
              required
              defaultValue={editing?.source}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        )}

        {kind === 'expense' && !isAdjustment && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Category</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {orderedCategories.map((category) => (
                <label key={category.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="categoryId"
                    value={category.id}
                    defaultChecked={editing?.categoryId === category.id}
                    required
                    className="peer sr-only"
                  />
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-sm peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white">
                    {category.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {kind === 'expense' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isAdjustment"
              checked={isAdjustment}
              onChange={(e) => setIsAdjustment(e.target.checked)}
            />
            This is a balance adjustment, not a category expense
          </label>
        )}

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
            Notes (optional)
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            defaultValue={editing?.notes ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded border border-slate-300 py-2 text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded bg-slate-900 py-2 text-white hover:bg-slate-700"
          >
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}
          </button>
        </div>

        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full text-center text-sm text-red-600"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the provider**

Create `app/(app)/quick-add/QuickAddProvider.tsx`:

```tsx
'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { QuickAddSheet } from './QuickAddSheet'
import type { AccountOption, CategoryOption, TransactionRecord } from './types'

type QuickAddContextValue = {
  openCreate: () => void
  openEdit: (transaction: TransactionRecord) => void
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error('useQuickAdd must be used within QuickAddProvider')
  return ctx
}

export function QuickAddProvider({
  children,
  accounts,
  categories,
  defaultAccountId,
  rankedCategoryIds,
}: {
  children: ReactNode
  accounts: AccountOption[]
  categories: CategoryOption[]
  defaultAccountId: string | null
  rankedCategoryIds: string[]
}) {
  const [state, setState] = useState<{ open: boolean; editing: TransactionRecord | null }>({
    open: false,
    editing: null,
  })

  return (
    <QuickAddContext.Provider
      value={{
        openCreate: () => setState({ open: true, editing: null }),
        openEdit: (transaction) => setState({ open: true, editing: transaction }),
      }}
    >
      {children}

      <button
        type="button"
        onClick={() => setState({ open: true, editing: null })}
        aria-label="Add transaction"
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-2xl text-white shadow-lg hover:bg-slate-700"
      >
        +
      </button>

      {state.open && (
        <QuickAddSheet
          accounts={accounts}
          categories={categories}
          defaultAccountId={defaultAccountId}
          rankedCategoryIds={rankedCategoryIds}
          editing={state.editing}
          onClose={() => setState({ open: false, editing: null })}
        />
      )}
    </QuickAddContext.Provider>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (This won't yet be wired into the app — Task 6 does
that — so there's nothing to click through yet.)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/quick-add/QuickAddSheet.tsx" "app/(app)/quick-add/QuickAddProvider.tsx"
git commit -m "Add quick-add bottom sheet and its provider/context"
```

---

### Task 6: Wire the quick-add FAB into the app shell + nav polish

**Files:**
- Create: `app/(app)/NavLink.tsx`
- Modify: `app/(app)/layout.tsx` (full rewrite — see below)

**Interfaces:**
- Consumes: `QuickAddProvider` from Task 5; `mostRecentAccountId`,
  `rankCategoriesByUsage` from Task 3.
- Produces: every page under `app/(app)/` now renders inside
  `QuickAddProvider`, so `useQuickAdd()` (Task 5) is callable from any of
  them — Task 8's Transactions list depends on this.

This task also closes three items deferred from the foundation plan's
final review, bundled in because they're all in this same file: sticky
bottom nav, iOS safe-area padding, and an active-tab indicator.

- [ ] **Step 1: Write the active-tab-aware nav link**

Create `app/(app)/NavLink.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex flex-col items-center py-2 text-xs ${
        isActive ? 'font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
  )
}
```

- [ ] **Step 2: Rewrite the layout**

Replace the full contents of `app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'
import { NavLink } from './NavLink'
import { QuickAddProvider } from './quick-add/QuickAddProvider'
import { mostRecentAccountId, rankCategoriesByUsage } from '@/lib/transactions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [accountsResult, categoriesResult, recentIncomeResult, recentExpenseResult] = await Promise.all([
    supabase.from('accounts').select('id, name, archived').order('name'),
    supabase.from('categories').select('id, name, archived').order('name'),
    supabase.from('income').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('expenses').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
  ])

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []

  const recentUses = [
    ...(recentIncomeResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
    ...(recentExpenseResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
  ]
  const defaultAccountId = mostRecentAccountId(recentUses)

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: recentCategoryUse } = await supabase
    .from('expenses')
    .select('category_id')
    .not('category_id', 'is', null)
    .gte('occurred_on', ninetyDaysAgo.toISOString().slice(0, 10))
  const rankedCategoryIds = rankCategoriesByUsage(
    (recentCategoryUse ?? []).map((row) => row.category_id as string)
  )

  return (
    <QuickAddProvider
      accounts={accounts}
      categories={categories}
      defaultAccountId={defaultAccountId}
      rankedCategoryIds={rankedCategoryIds}
    >
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <span className="font-semibold text-slate-900">Personal Finance</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Log out
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 pb-24">{children}</main>

        <nav className="sticky bottom-0 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </div>
    </QuickAddProvider>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

Start the dev server (`.claude/launch.json` already defines this on
:3000). Log in if not already authenticated (ask the human — Claude does
not handle passwords). Then:

1. Confirm the floating "+" button is visible in the bottom-right corner
   on every screen (Home, Transactions, Budget, Portfolio, Accounts).
2. Click it — confirm the bottom sheet opens with the Expense/Income
   toggle, and the Account dropdown is pre-populated with one of the
   seeded accounts (since no transactions exist yet, `defaultAccountId`
   will be `null` and the dropdown shows the placeholder — that's
   expected at this point in the plan).
3. Fill in Amount `1`, Date (leave default), Account `Cash`, Category
   `Coffee`, Notes `plan verification — safe to delete`, submit.
4. Expected: the sheet closes with no error (Task 8 hasn't built the
   Transactions list yet, so there's nowhere to see it appear — that's
   fine, this step is only confirming the create action itself succeeds).
5. Clean up: using the Supabase dashboard's Table Editor, delete the row
   you just inserted into `expenses` (matches Notes `plan verification —
   safe to delete`) so no test data lingers. (Task 8 will replace this
   manual cleanup with an in-app delete button.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/NavLink.tsx" "app/(app)/layout.tsx"
git commit -m "Wire quick-add FAB into the app shell; add sticky nav, safe-area padding, active-tab indicator"
```

---

### Task 7: Accounts & Categories admin screen

**Files:**
- Create: `app/(app)/accounts/actions.ts`
- Modify: `app/(app)/accounts/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `computeAccountBalances` from Task 3; `formatCurrency` from
  `lib/format.ts`; the `accounts.archived` / `categories.archived` columns
  from Task 1.
- Produces: `addAccount(formData: FormData): Promise<void>`,
  `setAccountArchived(id: string, archived: boolean): Promise<void>`,
  `addCategory(formData: FormData): Promise<void>`,
  `setCategoryArchived(id: string, archived: boolean): Promise<void>` from
  `app/(app)/accounts/actions.ts`.

- [ ] **Step 1: Write the Server Actions**

Create `app/(app)/accounts/actions.ts`:

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

export async function addAccount(formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const name = formData.get('name')
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Account name is required.')
  }

  const { error } = await supabase.from('accounts').insert({ name: name.trim() })
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function setAccountArchived(id: string, archived: boolean): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('accounts').update({ archived }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function addCategory(formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const name = formData.get('name')
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Category name is required.')
  }

  const { error } = await supabase.from('categories').insert({ name: name.trim() })
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('categories').update({ archived }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}
```

- [ ] **Step 2: Rewrite the page**

Replace the full contents of `app/(app)/accounts/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { computeAccountBalances } from '@/lib/transactions'
import { formatCurrency } from '@/lib/format'
import { addAccount, addCategory, setAccountArchived, setCategoryArchived } from './actions'

export default async function AccountsPage() {
  const supabase = await createClient()

  const [accountsResult, categoriesResult, incomeResult, expensesResult] = await Promise.all([
    supabase.from('accounts').select('id, name, archived').order('name'),
    supabase.from('categories').select('id, name, archived').order('name'),
    supabase.from('income').select('account_id, amount'),
    supabase.from('expenses').select('account_id, amount'),
  ])

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []
  const balances = computeAccountBalances(
    accounts.map((a) => a.id),
    (incomeResult.data ?? []).map((row) => ({ accountId: row.account_id, amount: row.amount })),
    (expensesResult.data ?? []).map((row) => ({ accountId: row.account_id, amount: row.amount }))
  )

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p
                  className={`font-medium ${
                    account.archived ? 'text-slate-400 line-through' : 'text-slate-900'
                  }`}
                >
                  {account.name}
                </p>
                <p className="text-sm text-slate-500">{formatCurrency(balances[account.id] ?? 0)}</p>
              </div>
              <form action={setAccountArchived.bind(null, account.id, !account.archived)}>
                <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                  {account.archived ? 'Unarchive' : 'Archive'}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addAccount} className="mt-3 flex gap-2">
          <input
            name="name"
            type="text"
            placeholder="New account name"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between px-4 py-3">
              <p
                className={`font-medium ${
                  category.archived ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}
              >
                {category.name}
              </p>
              <form action={setCategoryArchived.bind(null, category.id, !category.archived)}>
                <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                  {category.archived ? 'Unarchive' : 'Archive'}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addCategory} className="mt-3 flex gap-2">
          <input
            name="name"
            type="text"
            placeholder="New category name"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

With the dev server running and logged in, navigate to `/accounts`.

1. Confirm all 4 seeded accounts and 22 seeded categories are listed, each
   with an "Archive" button, and each account shows `₱0.00` (no
   transactions exist yet at this point in the plan).
2. Click "Archive" on `Maribank`. Confirm it now renders with strikethrough
   styling and the button now says "Unarchive".
3. Open the quick-add sheet (the "+" FAB), switch to Expense, open the
   Account dropdown — confirm `Maribank` is **not** in the list.
4. Close the sheet. Click "Unarchive" on `Maribank`. Confirm it's back to
   normal styling, and reappears in the quick-add Account dropdown.
   (No cleanup needed — this only toggled and restored existing seeded
   data, nothing new was created.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/accounts/actions.ts" "app/(app)/accounts/page.tsx"
git commit -m "Build Accounts & Categories admin screen with computed balances"
```

---

### Task 8: Transactions list

**Files:**
- Create: `app/(app)/transactions/TransactionRow.tsx`
- Modify: `app/(app)/transactions/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useQuickAdd` from Task 5's `QuickAddProvider.tsx`;
  `TransactionRecord` from Task 4's `types.ts`; `currentMonthInManila`
  from Task 2's `lib/date.ts`; `formatCurrency` from `lib/format.ts`.
- Produces: the Transactions screen — no later task in this plan depends
  on it.

- [ ] **Step 1: Write the row component**

Create `app/(app)/transactions/TransactionRow.tsx`:

```tsx
'use client'

import { formatCurrency } from '@/lib/format'
import { useQuickAdd } from '../quick-add/QuickAddProvider'
import type { TransactionRecord } from '../quick-add/types'

export function TransactionRow({
  transaction,
  accountName,
  categoryName,
}: {
  transaction: TransactionRecord
  accountName: string
  categoryName: string | null
}) {
  const { openEdit } = useQuickAdd()
  const signedAmount = transaction.kind === 'income' ? transaction.amount : -transaction.amount

  return (
    <li>
      <button
        type="button"
        onClick={() => openEdit(transaction)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div>
          <p className="font-medium text-slate-900">
            {transaction.isAdjustment
              ? 'Balance adjustment'
              : transaction.kind === 'income'
                ? transaction.source
                : (categoryName ?? 'Uncategorized')}
            {transaction.isAdjustment && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                adjustment
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">
            {transaction.occurredOn} · {accountName}
          </p>
        </div>
        <p className={signedAmount < 0 ? 'text-red-600' : 'text-emerald-600'}>
          {formatCurrency(signedAmount)}
        </p>
      </button>
    </li>
  )
}
```

- [ ] **Step 2: Rewrite the page**

Replace the full contents of `app/(app)/transactions/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { currentMonthInManila } from '@/lib/date'
import { TransactionRow } from './TransactionRow'
import type { TransactionRecord } from '../quick-add/types'

type SearchParams = {
  month?: string
  accountId?: string
  categoryId?: string
  type?: string
  q?: string
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const end = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, '0')}-01`
  return { start, end }
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const month = params.month ?? currentMonthInManila()
  const { start, end } = monthBounds(month)

  const supabase = await createClient()
  const [accountsResult, categoriesResult, incomeResult, expensesResult] = await Promise.all([
    supabase.from('accounts').select('id, name, archived').order('name'),
    supabase.from('categories').select('id, name, archived').order('name'),
    supabase
      .from('income')
      .select('id, occurred_on, amount, account_id, source, notes, is_adjustment')
      .gte('occurred_on', start)
      .lt('occurred_on', end),
    supabase
      .from('expenses')
      .select('id, occurred_on, amount, account_id, category_id, notes, is_adjustment')
      .gte('occurred_on', start)
      .lt('occurred_on', end),
  ])

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []

  let transactions: TransactionRecord[] = [
    ...(incomeResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'income' as const,
      occurredOn: row.occurred_on,
      amount: row.amount,
      accountId: row.account_id,
      notes: row.notes,
      isAdjustment: row.is_adjustment,
      source: row.source,
    })),
    ...(expensesResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'expense' as const,
      occurredOn: row.occurred_on,
      amount: row.amount,
      accountId: row.account_id,
      notes: row.notes,
      isAdjustment: row.is_adjustment,
      categoryId: row.category_id,
    })),
  ]

  if (params.type === 'income' || params.type === 'expense') {
    transactions = transactions.filter((t) => t.kind === params.type)
  }
  if (params.accountId) {
    transactions = transactions.filter((t) => t.accountId === params.accountId)
  }
  if (params.categoryId) {
    transactions = transactions.filter((t) => t.categoryId === params.categoryId)
  }
  if (params.q) {
    const q = params.q.toLowerCase()
    transactions = transactions.filter((t) => `${t.notes ?? ''} ${t.source ?? ''}`.toLowerCase().includes(q))
  }

  transactions.sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))

  const accountsById = new Map(accounts.map((a) => [a.id, a.name]))
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Transactions</h1>

      <form
        method="get"
        className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
      >
        <input
          type="month"
          name="month"
          defaultValue={month.slice(0, 7)}
          className="rounded border border-slate-300 px-2 py-1"
        />
        <select name="type" defaultValue={params.type ?? ''} className="rounded border border-slate-300 px-2 py-1">
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          name="accountId"
          defaultValue={params.accountId ?? ''}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          name="categoryId"
          defaultValue={params.categoryId ?? ''}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          placeholder="Search notes/source"
          defaultValue={params.q ?? ''}
          className="col-span-2 rounded border border-slate-300 px-2 py-1"
        />
        <button type="submit" className="col-span-2 rounded bg-slate-900 py-1.5 text-white">
          Filter
        </button>
      </form>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {transactions.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No transactions this month.</li>
        )}
        {transactions.map((t) => (
          <TransactionRow
            key={`${t.kind}-${t.id}`}
            transaction={t}
            accountName={accountsById.get(t.accountId) ?? 'Unknown'}
            categoryName={t.categoryId ? (categoriesById.get(t.categoryId) ?? 'Unknown') : null}
          />
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual browser verification**

With the dev server running and logged in, navigate to `/transactions`.

1. Confirm the page shows "No transactions this month" (nothing created
   yet this month) and the filter form (month/type/account/category/
   search) renders.
2. Click the "+" FAB, add an expense: amount `1`, category `Coffee`,
   account `Cash`, notes `plan verification — safe to delete`. Submit.
   Confirm it now appears in the list under "Coffee", red/negative
   ₱1.00, today's date, Cash.
3. Tap the row. Confirm the sheet reopens pre-filled with those exact
   values. Change amount to `2`, save. Confirm the list now shows ₱2.00.
4. Tap the row again, click "Delete", confirm the browser confirmation
   dialog, confirm it accepts, and confirm the row is gone from the list.
5. Add an income: amount `5`, source `Plan verification`, account `Cash`.
   Confirm it appears in green/positive ₱5.00. Delete it the same way as
   step 4.
6. Add an expense with the "balance adjustment" checkbox checked (no
   category shown/required). Confirm it submits successfully and the row
   shows the "adjustment" badge and label "Balance adjustment". Delete it.
7. Use the filter form: set Type to "Income" and confirm the list updates
   to show only income rows (should be empty at this point, since all
   test rows were deleted) — confirms the filter round-trips through the
   URL correctly.
8. Confirm no leftover test transactions remain in the list after this
   verification pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/transactions/TransactionRow.tsx" "app/(app)/transactions/page.tsx"
git commit -m "Build Transactions list with filters, search, and tap-to-edit"
```

---

### Task 9: Final regression pass

**Files:** none (verification only; commit only if a bug is found and fixed)

**Interfaces:** none

- [ ] **Step 1: Full end-to-end walkthrough**

With the dev server running and logged in:

1. From the Home screen, tap the FAB, add a real-looking test expense and
   confirm it's reachable and functional from a screen other than
   Transactions (proves the FAB/provider is mounted at the layout level,
   not per-page). Delete it afterward.
2. On `/transactions`, confirm filtering by each of month, type, account,
   and category (individually) narrows the list as expected using
   whatever real historical-looking data you created and cleaned up in
   Tasks 6–8 (there should be none left — if any test rows are still
   present, delete them now).
3. On `/accounts`, confirm every seeded account's balance reads `₱0.00`
   (all test transactions were cleaned up in prior tasks, so real totals
   should still be zero at this point — nothing has been permanently
   added yet).

- [ ] **Step 2: Mobile viewport check**

Resize the browser preview to the "mobile" preset. Reload.

1. Confirm the bottom nav stays stuck to the bottom of the viewport while
   scrolling a screen with enough content to scroll (e.g. `/accounts`
   with its 4 accounts + 22 categories).
2. Confirm the currently active tab (e.g. "Transactions" while on
   `/transactions`) is visually distinguished from the others.
3. Confirm the quick-add sheet's bottom padding clears the device's home
   indicator area (no content flush against the very bottom edge).

- [ ] **Step 3: Take a screenshot for the record**

Use the browser tool's screenshot action on the Transactions screen at
mobile viewport size as visual confirmation this phase is complete.

- [ ] **Step 4: Update progress notes**

Edit `docs/superpowers/PROGRESS.md`: replace the "Product direction for
the NEXT plan" section's framing (it currently describes this work as not
yet scoped) with a short "Transactions core: ✅ COMPLETE" summary in the
same style as the existing Foundation plan section, and update "How to
resume in a new session" to point at sub-project 2 (Budgeting) as the
next step, referencing `docs/superpowers/specs/2026-08-18-transactions-core-design.md`
§7 for the full remaining sequence.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/PROGRESS.md
git commit -m "Update progress notes: Transactions core complete"
```

(If Step 1 or 2 surfaced a real bug, fix it, re-verify, and commit that
fix as its own commit before this one.)
