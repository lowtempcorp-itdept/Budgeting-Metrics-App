'use client'

import { formatCurrency } from '@/lib/format'
import { useQuickAdd } from '../quick-add/QuickAddProvider'
import type { TransactionRecord } from '../quick-add/types'

export function TransactionRow({
  transaction,
  accountName,
  categoryName,
}: {
  transaction: TransactionRecord
  accountName: string
  categoryName: string | null
}) {
  const { openEdit } = useQuickAdd()
  const signedAmount = transaction.kind === 'income' ? transaction.amount : -transaction.amount

  return (
    <li>
      <button
        type="button"
        onClick={() => openEdit(transaction)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div>
          <p className="font-medium text-slate-900">
            {transaction.isAdjustment
              ? 'Balance adjustment'
              : transaction.kind === 'income'
                ? transaction.source
                : (categoryName ?? 'Uncategorized')}
            {transaction.isAdjustment && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                adjustment
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">
            {transaction.occurredOn} · {accountName}
          </p>
        </div>
        <p className={signedAmount < 0 ? 'text-red-600' : 'text-emerald-600'}>
          {formatCurrency(signedAmount)}
        </p>
      </button>
    </li>
  )
}
