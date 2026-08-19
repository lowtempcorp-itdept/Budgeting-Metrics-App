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
    categoryName: (winnerId && categoryNames[winnerId]) || 'Uncategorized',
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
