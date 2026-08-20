'use client'

import { useActionState, useState } from 'react'
import { addRecurringConstant, updateRecurringConstant, type RecurringConstantFormState } from './recurring-actions'

export type RecurringConstantRecord = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  frequency: 'monthly' | 'yearly'
  dayOfMonth: number
  monthOfYear: number | null
  accountId: string
  categoryId: string | null
  source: string | null
  notes: string | null
}

const initialState: RecurringConstantFormState = { error: null, submitted: false }

export function RecurringConstantForm({
  accounts,
  categories,
  editing,
  onDone,
}: {
  accounts: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
  editing: RecurringConstantRecord | null
  onDone: () => void
}) {
  const [kind, setKind] = useState<'expense' | 'income'>(editing?.kind ?? 'expense')
  const [frequency, setFrequency] = useState<'monthly' | 'yearly'>(editing?.frequency ?? 'monthly')
  const action = editing ? updateRecurringConstant.bind(null, editing.id) : addRecurringConstant
  const [state, formAction, pending] = useActionState(action, initialState)

  if (state.submitted && state.error === null) {
    onDone()
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind('expense')}
          disabled={!!editing}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            kind === 'expense' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setKind('income')}
          disabled={!!editing}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            kind === 'income' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Income
        </button>
      </div>
      <input type="hidden" name="kind" value={kind} />

      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        required
        defaultValue={editing?.amount}
        placeholder="Amount"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <select
        name="accountId"
        required
        defaultValue={editing?.accountId ?? ''}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Select an account
        </option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      {kind === 'expense' && (
        <select
          name="categoryId"
          required
          defaultValue={editing?.categoryId ?? ''}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {kind === 'income' && (
        <input
          name="source"
          type="text"
          required
          defaultValue={editing?.source ?? ''}
          placeholder="Source (e.g. Salary)"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFrequency('monthly')}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            frequency === 'monthly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setFrequency('yearly')}
          className={`flex-1 rounded py-1.5 text-sm font-medium ${
            frequency === 'yearly' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
          }`}
        >
          Yearly
        </button>
      </div>
      <input type="hidden" name="frequency" value={frequency} />

      <div className="flex gap-2">
        <input
          name="dayOfMonth"
          type="number"
          min="1"
          max="31"
          required
          defaultValue={editing?.dayOfMonth}
          placeholder="Day (1–31)"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        {frequency === 'yearly' && (
          <input
            name="monthOfYear"
            type="number"
            min="1"
            max="12"
            required
            defaultValue={editing?.monthOfYear ?? undefined}
            placeholder="Month (1–12)"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        )}
      </div>

      <input
        name="notes"
        type="text"
        defaultValue={editing?.notes ?? ''}
        placeholder="Notes (e.g. Netflix)"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="flex gap-2">
        <button type="button" onClick={onDone} className="flex-1 rounded border border-slate-300 py-2 text-sm text-slate-700">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="flex-1 rounded bg-slate-900 py-2 text-sm text-white hover:bg-slate-700">
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}
        </button>
      </div>
    </form>
  )
}
