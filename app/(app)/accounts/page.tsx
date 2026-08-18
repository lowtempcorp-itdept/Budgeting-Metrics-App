import { createClient } from '@/lib/supabase/server'
import { computeAccountBalances } from '@/lib/transactions'
import { formatCurrency } from '@/lib/format'
import { addAccount, addCategory, setAccountArchived, setCategoryArchived } from './actions'

export default async function AccountsPage() {
  const supabase = await createClient()

  const [accountsResult, categoriesResult, incomeResult, expensesResult] = await Promise.all([
    supabase.from('accounts').select('id, name, archived').order('name'),
    supabase.from('categories').select('id, name, archived').order('name'),
    supabase.from('income').select('account_id, amount'),
    supabase.from('expenses').select('account_id, amount'),
  ])

  for (const result of [accountsResult, categoriesResult, incomeResult, expensesResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []
  const balances = computeAccountBalances(
    accounts.map((a) => a.id),
    (incomeResult.data ?? []).map((row) => ({ accountId: row.account_id, amount: row.amount })),
    (expensesResult.data ?? []).map((row) => ({ accountId: row.account_id, amount: row.amount }))
  )

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold text-slate-900">Accounts</h1>
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p
                  className={`font-medium ${
                    account.archived ? 'text-slate-400 line-through' : 'text-slate-900'
                  }`}
                >
                  {account.name}
                </p>
                <p className="text-sm text-slate-500">{formatCurrency(balances[account.id] ?? 0)}</p>
              </div>
              <form action={setAccountArchived.bind(null, account.id, !account.archived)}>
                <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                  {account.archived ? 'Unarchive' : 'Archive'}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addAccount} className="mt-3 flex gap-2">
          <input
            name="name"
            type="text"
            placeholder="New account name"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between px-4 py-3">
              <p
                className={`font-medium ${
                  category.archived ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}
              >
                {category.name}
              </p>
              <form action={setCategoryArchived.bind(null, category.id, !category.archived)}>
                <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
                  {category.archived ? 'Unarchive' : 'Archive'}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addCategory} className="mt-3 flex gap-2">
          <input
            name="name"
            type="text"
            placeholder="New category name"
            required
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  )
}
