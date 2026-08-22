import { formatCurrency } from '@/lib/format'
import { setCategoryBudget, removeCategoryBudget } from './actions'

export function CategoryBudgetTable({
  month,
  rows,
  unbudgetedCategories,
}: {
  month: string
  rows: Array<{ categoryId: string; categoryName: string; planned: number; actual: number }>
  unbudgetedCategories: Array<{ id: string; name: string }>
}) {
  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Per-category budgets (optional)
      </summary>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No category budgets set for this month.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-1 font-normal">Category</th>
                <th className="pb-1 font-normal">Planned</th>
                <th className="pb-1 font-normal">Actual</th>
                <th className="pb-1 font-normal">Difference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const difference = row.planned - row.actual
                return (
                  <tr key={row.categoryId} className="border-t border-slate-100">
                    <td className="py-1.5">{row.categoryName}</td>
                    <td className="py-1.5 font-ledger-mono">{formatCurrency(row.planned)}</td>
                    <td className="py-1.5 font-ledger-mono">{formatCurrency(row.actual)}</td>
                    <td className={`py-1.5 font-ledger-mono ${difference < 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(difference)}
                    </td>
                    <td className="py-1.5 text-right">
                      <form action={removeCategoryBudget.bind(null, month, row.categoryId)}>
                        <button type="submit" className="text-xs text-slate-400 hover:text-slate-700">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {unbudgetedCategories.length > 0 && (
          <div className="space-y-2 pt-2">
            {unbudgetedCategories.map((c) => (
              <form key={c.id} action={setCategoryBudget.bind(null, month, c.id)} className="flex items-center gap-2">
                <span className="w-28 flex-none text-sm text-slate-600">{c.name}</span>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Planned amount"
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
                  Add
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
