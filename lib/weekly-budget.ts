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
