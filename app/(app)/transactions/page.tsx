import { createClient } from '@/lib/supabase/server'
import { currentMonthInManila } from '@/lib/date'
import { TransactionRow } from './TransactionRow'
import type { TransactionRecord } from '../quick-add/types'

type SearchParams = {
  month?: string
  accountId?: string
  categoryId?: string
  type?: string
  q?: string
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const start = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const end = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, '0')}-01`
  return { start, end }
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const month = params.month ?? currentMonthInManila()
  const { start, end } = monthBounds(month)

  const supabase = await createClient()
  const [accountsResult, categoriesResult, incomeResult, expensesResult] = await Promise.all([
    supabase.from('accounts').select('id, name, archived').order('name'),
    supabase.from('categories').select('id, name, archived').order('name'),
    supabase
      .from('income')
      .select('id, occurred_on, amount, account_id, source, notes, is_adjustment')
      .gte('occurred_on', start)
      .lt('occurred_on', end),
    supabase
      .from('expenses')
      .select('id, occurred_on, amount, account_id, category_id, notes, is_adjustment')
      .gte('occurred_on', start)
      .lt('occurred_on', end),
  ])

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []

  let transactions: TransactionRecord[] = [
    ...(incomeResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'income' as const,
      occurredOn: row.occurred_on,
      amount: row.amount,
      accountId: row.account_id,
      notes: row.notes,
      isAdjustment: row.is_adjustment,
      source: row.source,
    })),
    ...(expensesResult.data ?? []).map((row) => ({
      id: row.id,
      kind: 'expense' as const,
      occurredOn: row.occurred_on,
      amount: row.amount,
      accountId: row.account_id,
      notes: row.notes,
      isAdjustment: row.is_adjustment,
      categoryId: row.category_id,
    })),
  ]

  if (params.type === 'income' || params.type === 'expense') {
    transactions = transactions.filter((t) => t.kind === params.type)
  }
  if (params.accountId) {
    transactions = transactions.filter((t) => t.accountId === params.accountId)
  }
  if (params.categoryId) {
    transactions = transactions.filter((t) => t.categoryId === params.categoryId)
  }
  if (params.q) {
    const q = params.q.toLowerCase()
    transactions = transactions.filter((t) => `${t.notes ?? ''} ${t.source ?? ''}`.toLowerCase().includes(q))
  }

  transactions.sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0))

  const accountsById = new Map(accounts.map((a) => [a.id, a.name]))
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Transactions</h1>

      <form
        method="get"
        className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
      >
        <input
          type="month"
          name="month"
          defaultValue={month.slice(0, 7)}
          className="rounded border border-slate-300 px-2 py-1"
        />
        <select name="type" defaultValue={params.type ?? ''} className="rounded border border-slate-300 px-2 py-1">
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          name="accountId"
          defaultValue={params.accountId ?? ''}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          name="categoryId"
          defaultValue={params.categoryId ?? ''}
          className="rounded border border-slate-300 px-2 py-1"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          placeholder="Search notes/source"
          defaultValue={params.q ?? ''}
          className="col-span-2 rounded border border-slate-300 px-2 py-1"
        />
        <button type="submit" className="col-span-2 rounded bg-slate-900 py-1.5 text-white">
          Filter
        </button>
      </form>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {transactions.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No transactions this month.</li>
        )}
        {transactions.map((t) => (
          <TransactionRow
            key={`${t.kind}-${t.id}`}
            transaction={t}
            accountName={accountsById.get(t.accountId) ?? 'Unknown'}
            categoryName={t.categoryId ? (categoriesById.get(t.categoryId) ?? 'Unknown') : null}
          />
        ))}
      </ul>
    </div>
  )
}
