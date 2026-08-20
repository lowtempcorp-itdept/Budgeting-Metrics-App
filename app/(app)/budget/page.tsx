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
    supabase.from('income').select('occurred_on, amount, is_adjustment'),
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
    .filter((row) => !row.is_adjustment && row.occurred_on >= requestedWeek && row.occurred_on <= weekEnd)
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
