'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { createTransaction, updateTransaction, deleteTransaction } from './actions'
import type {
  AccountOption,
  CategoryOption,
  TransactionKind,
  TransactionRecord,
} from './types'
import { todayInManila } from '@/lib/date'

const initialState = { error: null as string | null, submitted: false }

export function QuickAddSheet({
  accounts,
  categories,
  defaultAccountId,
  rankedCategoryIds,
  editing,
  onClose,
}: {
  accounts: AccountOption[]
  categories: CategoryOption[]
  defaultAccountId: string | null
  rankedCategoryIds: string[]
  editing: TransactionRecord | null
  onClose: () => void
}) {
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? 'expense')
  const [isAdjustment, setIsAdjustment] = useState(editing?.isAdjustment ?? false)
  const action = editing ? updateTransaction.bind(null, editing.id, editing.kind) : createTransaction
  const [state, formAction, pending] = useActionState(action, initialState)
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    if (state.submitted && state.error === null) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const activeAccounts = accounts.filter((a) => !a.archived || a.id === editing?.accountId)
  const activeCategories = categories.filter((c) => !c.archived || c.id === editing?.categoryId)
  const orderedCategories = [
    ...rankedCategoryIds
      .map((id) => activeCategories.find((c) => c.id === id))
      .filter((c): c is CategoryOption => c !== undefined),
    ...activeCategories.filter((c) => !rankedCategoryIds.includes(c.id)),
  ]

  function handleDelete() {
    if (!editing) return
    if (!window.confirm('Delete this transaction?')) return
    startDeleteTransition(async () => {
      await deleteTransaction(editing.id, editing.kind)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <form
        action={formAction}
        onClick={(e) => e.stopPropagation()}
        className="w-full space-y-4 rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind('expense')}
            disabled={!!editing}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              kind === 'expense' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setKind('income')}
            disabled={!!editing}
            className={`flex-1 rounded py-2 text-sm font-medium ${
              kind === 'income' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Income
          </button>
        </div>
        <input type="hidden" name="kind" value={kind} />

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-slate-700">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={editing?.amount}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="occurredOn" className="block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            id="occurredOn"
            name="occurredOn"
            type="date"
            required
            defaultValue={editing?.occurredOn ?? todayInManila()}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-slate-700">
            Account
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue={editing?.accountId ?? defaultAccountId ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>
              Select an account
            </option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {kind === 'income' && (
          <div>
            <label htmlFor="source" className="block text-sm font-medium text-slate-700">
              Source
            </label>
            <input
              id="source"
              name="source"
              type="text"
              required
              defaultValue={editing?.source}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        )}

        {kind === 'expense' && !isAdjustment && (
          <div>
            <label className="block text-sm font-medium text-slate-700">Category</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {orderedCategories.map((category) => (
                <label key={category.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="categoryId"
                    value={category.id}
                    defaultChecked={editing?.categoryId === category.id}
                    required
                    className="peer sr-only"
                  />
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-sm peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white">
                    {category.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {kind === 'expense' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="isAdjustment"
              checked={isAdjustment}
              onChange={(e) => setIsAdjustment(e.target.checked)}
            />
            This is a balance adjustment, not a category expense
          </label>
        )}

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
            Notes (optional)
          </label>
          <input
            id="notes"
            name="notes"
            type="text"
            defaultValue={editing?.notes ?? ''}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded border border-slate-300 py-2 text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded bg-slate-900 py-2 text-white hover:bg-slate-700"
          >
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}
          </button>
        </div>

        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full text-center text-sm text-red-600"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </form>
    </div>
  )
}
