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
