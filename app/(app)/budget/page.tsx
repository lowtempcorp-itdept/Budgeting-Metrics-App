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
      supabase.from('income').select('occurred_on, amount, is_adjustment'),
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
    .filter((row) => !row.is_adjustment && row.occurred_on >= requestedWeek && row.occurred_on <= weekEnd)
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
