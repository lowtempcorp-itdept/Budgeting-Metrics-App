export type RecurringFrequency = 'monthly' | 'yearly'

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the *next* month is the last day of `month`.
  return new Date(year, month, 0).getDate()
}

function clampToMonth(year: number, month: number, day: number): string {
  const clampedDay = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

export function computeInitialNextDueOn(
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null,
  today: string
): string {
  const [todayYear, todayMonth] = today.slice(0, 7).split('-').map(Number)

  if (frequency === 'monthly') {
    const thisMonthDue = clampToMonth(todayYear, todayMonth, dayOfMonth)
    if (thisMonthDue >= today) return thisMonthDue
    const nextMonth = todayMonth === 12 ? 1 : todayMonth + 1
    const nextYear = todayMonth === 12 ? todayYear + 1 : todayYear
    return clampToMonth(nextYear, nextMonth, dayOfMonth)
  }

  const month = monthOfYear as number
  const thisYearDue = clampToMonth(todayYear, month, dayOfMonth)
  if (thisYearDue >= today) return thisYearDue
  return clampToMonth(todayYear + 1, month, dayOfMonth)
}

export function advanceNextDueOn(
  currentDueOn: string,
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null
): string {
  const [year, month] = currentDueOn.slice(0, 7).split('-').map(Number)

  if (frequency === 'monthly') {
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    return clampToMonth(nextYear, nextMonth, dayOfMonth)
  }

  return clampToMonth(year + 1, monthOfYear as number, dayOfMonth)
}
