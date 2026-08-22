import { formatCurrency } from '@/lib/format'
import { deriveMonthlyBudget, deriveDailyBudget, computeLeftover, formatWeekRange } from '@/lib/weekly-budget'
import { setWeeklyBudget } from './actions'

export function WeeklyBudgetCard({
  weekStart,
  prevWeekStart,
  nextWeekStart,
  plannedAmount,
  spentSoFar,
  incomeThisWeek,
  isPastWeek,
}: {
  weekStart: string
  prevWeekStart: string
  nextWeekStart: string
  plannedAmount: number | null
  spentSoFar: number
  incomeThisWeek: number
  isPastWeek: boolean
}) {
  const remaining = plannedAmount !== null ? plannedAmount - spentSoFar : null
  const monthly = plannedAmount !== null ? deriveMonthlyBudget(plannedAmount) : null
  const daily = plannedAmount !== null ? deriveDailyBudget(plannedAmount) : null
  const leftover = plannedAmount !== null ? computeLeftover(incomeThisWeek, plannedAmount) : null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <a
          href={`/budget?week=${prevWeekStart}`}
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Previous week"
        >
          ◀
        </a>
        <h1 className="text-sm font-medium text-slate-600">Week of {formatWeekRange(weekStart)}</h1>
        <a
          href={`/budget?week=${nextWeekStart}`}
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
          aria-label="Next week"
        >
          ▶
        </a>
      </div>

      {plannedAmount === null ? (
        isPastWeek ? (
          <p className="mt-4 text-center text-sm text-slate-500">No budget was set for this week.</p>
        ) : (
          <form action={setWeeklyBudget.bind(null, weekStart)} className="mt-4 flex gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="Set this week's budget"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
              Set
            </button>
          </form>
        )
      ) : (
        <>
          <p className="mt-2 text-center font-ledger-mono text-4xl font-semibold text-slate-900">
            {formatCurrency(plannedAmount)}
          </p>
          <p className="mt-1 text-center text-sm text-slate-500">
            {formatCurrency(spentSoFar)} spent · {formatCurrency(remaining as number)} remaining
          </p>

          <div className="mt-4 flex justify-center gap-6 text-center text-sm text-slate-500">
            <div>
              <p className="font-ledger-mono text-lg text-slate-700">{formatCurrency(monthly as number)}</p>
              <p>/month (×4)</p>
            </div>
            <div>
              <p className="font-ledger-mono text-lg text-slate-700">{formatCurrency(daily as number)}</p>
              <p>/day (÷7)</p>
            </div>
          </div>

          <p className={`mt-4 text-center text-sm ${(leftover as number) < 0 ? 'font-medium text-red-600' : 'text-slate-600'}`}>
            Income this week: {formatCurrency(incomeThisWeek)} · Leftover after budget:{' '}
            {formatCurrency(leftover as number)}
            {(leftover as number) < 0 ? ' — budgeted more than you have earned' : ''}
          </p>

          {!isPastWeek && (
            <details className="mt-3 text-center text-sm">
              <summary className="cursor-pointer text-slate-500">Change this week&apos;s budget</summary>
              <form action={setWeeklyBudget.bind(null, weekStart)} className="mt-2 flex gap-2">
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  defaultValue={plannedAmount}
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
                  Update
                </button>
              </form>
            </details>
          )}
        </>
      )}
    </section>
  )
}
