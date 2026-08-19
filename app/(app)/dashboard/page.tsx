import { createClient } from '@/lib/supabase/server'
import { computeAccountBalances } from '@/lib/transactions'
import { currentMonthInManila, todayInManila } from '@/lib/date'
import { computeInsights, type InsightAccount, type InsightExpenseRow, type InsightBudgetRow } from '@/lib/insights'
import { computeNetByTicker } from '@/lib/portfolio'
import { fraunces, workSans, ibmPlexMono } from './fonts'
import { Masthead } from './Masthead'
import { HeroKpis } from './HeroKpis'
import { InsightsPanel } from './InsightsPanel'
import { AccountCardsRow } from './AccountCardsRow'
import { PortfolioSummary } from './PortfolioSummary'
import { CategoryBars } from './CategoryBars'

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
        <InsightsPanel insights={insights} />
        <AccountCardsRow accounts={accountCards} />
        <PortfolioSummary positions={portfolioPositions} />
        <CategoryBars categories={categoryBars} />
      </div>
    </div>
  )
}
