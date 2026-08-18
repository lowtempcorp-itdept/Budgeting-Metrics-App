export type TransactionKind = 'income' | 'expense'

export type AccountOption = {
  id: string
  name: string
  archived: boolean
}

export type CategoryOption = {
  id: string
  name: string
  archived: boolean
}

export type TransactionRecord = {
  id: string
  kind: TransactionKind
  occurredOn: string
  amount: number
  accountId: string
  notes: string | null
  isAdjustment: boolean
  // income only
  source?: string
  // expense only
  categoryId?: string | null
}
