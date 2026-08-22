'use client'

import { useState, useTransition } from 'react'
import { formatCurrency } from '@/lib/format'
import { setRecurringConstantActive, deleteRecurringConstant } from './recurring-actions'
import { RecurringConstantForm, type RecurringConstantRecord } from './RecurringConstantForm'

export function RecurringConstantsList({
  constants,
  accounts,
  categories,
}: {
  constants: RecurringConstantRecord[]
  accounts: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
}) {
  const [editingId, setEditingId] = useState<string | null | 'new'>(null)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  function handleDelete(id: string) {
    if (!window.confirm('Delete this recurring constant? Past auto-posted transactions stay untouched.')) return
    setActionError(null)
    startTransition(async () => {
      try {
        await deleteRecurringConstant(id)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to delete.')
      }
    })
  }

  function handlePause(id: string) {
    setActionError(null)
    startTransition(async () => {
      try {
        await setRecurringConstantActive(id, false)
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to pause.')
      }
    })
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4" open>
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Recurring constants</summary>

      <div className="mt-3 space-y-2">
        {actionError && <p className="text-sm text-red-600">{actionError}</p>}

        {constants.length === 0 && editingId !== 'new' && (
          <p className="text-sm text-slate-500">No recurring constants yet — add taxes, subscriptions, or salary below.</p>
        )}

        {constants.map((c) =>
          editingId === c.id ? (
            <RecurringConstantForm
              key={c.id}
              accounts={accounts}
              categories={categories}
              editing={c}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div key={c.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-t-0">
              <div>
                <p className="text-sm font-medium text-slate-900">{c.notes ?? (c.kind === 'income' ? c.source : 'Expense')}</p>
                <p className="text-xs text-slate-500">
                  {formatCurrency(c.amount)} · {c.frequency} · day {c.dayOfMonth}
                  {c.frequency === 'yearly' ? `/${c.monthOfYear}` : ''}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={() => setEditingId(c.id)} className="text-slate-500 hover:text-slate-900">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handlePause(c.id)}
                  disabled={isPending}
                  className="text-slate-500 hover:text-slate-900"
                >
                  Pause
                </button>
                <button type="button" onClick={() => handleDelete(c.id)} disabled={isPending} className="text-red-600 hover:text-red-800">
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {editingId === 'new' ? (
          <RecurringConstantForm accounts={accounts} categories={categories} editing={null} onDone={() => setEditingId(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditingId('new')}
            className="w-full rounded border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            + Add a recurring constant
          </button>
        )}
      </div>
    </details>
  )
}
