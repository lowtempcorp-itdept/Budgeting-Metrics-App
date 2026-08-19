import { createClient } from '@/lib/supabase/server'
import { computeAccountBalances } from '@/lib/transactions'
import { currentMonthInManila, todayInManila } from '@/lib/date'
import { computeInsights, type InsightAccount, type InsightExpenseRow, type InsightBudgetRow } from '@/lib/insights'
import { computeNetByTicker } from '@/lib/portfolio'
import { computeTrend } from '@/lib/trend'
import { STAGGER_DELAYS_MS } from '@/lib/motion'
import { fraunces, workSans, ibmPlexMono } from './fonts'
import { Masthead } from './Masthead'
import { HeroKpis } from './HeroKpis'
import { InsightsPanel } from './InsightsPanel'
import { AccountCardsRow } from './AccountCardsRow'
import { PortfolioSummary } from './PortfolioSummary'
import { CategoryBars } from './CategoryBars'
import { TrendChart } from './TrendChart'
import { PeriodSelector } from './PeriodSelector'

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

  const trendPoints = computeTrend(
    trendMonths,
    income.map((row) => ({ occurredOn: row.occurred_on, amount: row.amount })),
    expenses.map((row) => ({ occurredOn: row.occurred_on, amount: row.amount }))
  )

  return (
    <div className={`dash-ground -m-4 mb-[-6rem] min-h-[calc(100vh-8rem)] p-4 pb-28 ${fraunces.variable} ${workSans.variable} ${ibmPlexMono.variable}`}>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <div className="dash-enter" style={{ animationDelay: `${STAGGER_DELAYS_MS[0]}ms` }}>
          <Masthead displayName={displayName} today={today} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} />
        </div>
        <div className="dash-enter" style={{ animationDelay: `${STAGGER_DELAYS_MS[1]}ms` }}>
          <HeroKpis
            total={total}
            incomeMtd={incomeMtd}
            expenseMtd={expenseMtd}
            netMtd={netMtd}
            budgetPercentUsed={budgetPercentUsed}
          />
        </div>
        <div className="dash-enter" style={{ animationDelay: `${STAGGER_DELAYS_MS[2]}ms` }}>
          <InsightsPanel insights={insights} />
        </div>
        <div className="dash-enter" style={{ animationDelay: `${STAGGER_DELAYS_MS[3]}ms` }}>
          <AccountCardsRow accounts={accountCards} />
        </div>
        <div className="dash-enter" style={{ animationDelay: `${STAGGER_DELAYS_MS[4]}ms` }}>
          <PortfolioSummary positions={portfolioPositions} />
        </div>
        <div className="dash-enter flex flex-col gap-4" style={{ animationDelay: `${STAGGER_DELAYS_MS[5]}ms` }}>
          <CategoryBars categories={categoryBars} />
          <div className="dash-panel rounded-2xl p-5">
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
        </div>
      </div>
    </div>
  )
}
