import { monthsAgoInManila } from './date'

export type TrendAmountRow = { occurredOn: string; amount: number }

export type TrendMonthPoint = {
  month: string
  income: number
  expense: number
}

export function computeTrend(
  months: number,
  income: TrendAmountRow[],
  expenses: TrendAmountRow[],
  referenceDate: Date = new Date()
): TrendMonthPoint[] {
  const monthKeys: string[] = []
  for (let n = months - 1; n >= 0; n--) monthKeys.push(monthsAgoInManila(n, referenceDate))

  function sumForMonth(rows: TrendAmountRow[], month: string): number {
    const prefix = month.slice(0, 7)
    return rows.filter((row) => row.occurredOn.startsWith(prefix)).reduce((sum, row) => sum + row.amount, 0)
  }

  return monthKeys.map((month) => ({
    month,
    income: sumForMonth(income, month),
    expense: sumForMonth(expenses, month),
  }))
}
