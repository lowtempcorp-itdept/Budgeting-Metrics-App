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
