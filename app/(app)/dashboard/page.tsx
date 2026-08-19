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
