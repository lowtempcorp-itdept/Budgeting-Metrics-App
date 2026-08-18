'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { QuickAddSheet } from './QuickAddSheet'
import type { AccountOption, CategoryOption, TransactionRecord } from './types'

type QuickAddContextValue = {
  openCreate: () => void
  openEdit: (transaction: TransactionRecord) => void
}

const QuickAddContext = createContext<QuickAddContextValue | null>(null)

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error('useQuickAdd must be used within QuickAddProvider')
  return ctx
}

export function QuickAddProvider({
  children,
  accounts,
  categories,
  defaultAccountId,
  rankedCategoryIds,
}: {
  children: ReactNode
  accounts: AccountOption[]
  categories: CategoryOption[]
  defaultAccountId: string | null
  rankedCategoryIds: string[]
}) {
  const [state, setState] = useState<{ open: boolean; editing: TransactionRecord | null }>({
    open: false,
    editing: null,
  })

  return (
    <QuickAddContext.Provider
      value={{
        openCreate: () => setState({ open: true, editing: null }),
        openEdit: (transaction) => setState({ open: true, editing: transaction }),
      }}
    >
      {children}

      <button
        type="button"
        onClick={() => setState({ open: true, editing: null })}
        aria-label="Add transaction"
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-2xl text-white shadow-lg hover:bg-slate-700"
      >
        +
      </button>

      {state.open && (
        <QuickAddSheet
          accounts={accounts}
          categories={categories}
          defaultAccountId={defaultAccountId}
          rankedCategoryIds={rankedCategoryIds}
          editing={state.editing}
          onClose={() => setState({ open: false, editing: null })}
        />
      )}
    </QuickAddContext.Provider>
  )
}
