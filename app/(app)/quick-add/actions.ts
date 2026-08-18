'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TransactionKind } from './types'

export type TransactionFormState = {
  error: string | null
  submitted: boolean
}

type ParsedFields =
  | {
      ok: true
      kind: 'income'
      occurredOn: string
      amount: number
      accountId: string
      source: string
      notes: string | null
    }
  | {
      ok: true
      kind: 'expense'
      occurredOn: string
      amount: number
      accountId: string
      categoryId: string | null
      isAdjustment: boolean
      notes: string | null
    }
  | { ok: false; error: string }

function parseFields(kind: TransactionKind, formData: FormData): ParsedFields {
  const occurredOn = formData.get('occurredOn')
  const amountRaw = formData.get('amount')
  const accountId = formData.get('accountId')
  const notesRaw = formData.get('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null

  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }
  if (typeof occurredOn !== 'string' || occurredOn.length === 0) {
    return { ok: false, error: 'Date is required.' }
  }
  if (typeof accountId !== 'string' || accountId.length === 0) {
    return { ok: false, error: 'Account is required.' }
  }

  if (kind === 'income') {
    const source = formData.get('source')
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { ok: false, error: 'Source is required for income.' }
    }
    return { ok: true, kind: 'income', occurredOn, amount, accountId, source: source.trim(), notes }
  }

  const isAdjustment = formData.get('isAdjustment') === 'on'
  const categoryIdRaw = formData.get('categoryId')
  const categoryId = typeof categoryIdRaw === 'string' && categoryIdRaw.length > 0 ? categoryIdRaw : null
  if (!isAdjustment && categoryId === null) {
    return { ok: false, error: 'Category is required unless this is a balance adjustment.' }
  }
  return { ok: true, kind: 'expense', occurredOn, amount, accountId, categoryId, isAdjustment, notes }
}

function buildPayload(parsed: Extract<ParsedFields, { ok: true }>) {
  if (parsed.kind === 'income') {
    return {
      table: 'income' as const,
      payload: {
        occurred_on: parsed.occurredOn,
        amount: parsed.amount,
        account_id: parsed.accountId,
        source: parsed.source,
        notes: parsed.notes,
      },
    }
  }
  return {
    table: 'expenses' as const,
    payload: {
      occurred_on: parsed.occurredOn,
      amount: parsed.amount,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      is_adjustment: parsed.isAdjustment,
      notes: parsed.notes,
    },
  }
}

export async function createTransaction(
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const kindRaw = formData.get('kind')
  const kind: TransactionKind = kindRaw === 'income' ? 'income' : 'expense'
  const parsed = parseFields(kind, formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const { table, payload } = buildPayload(parsed)
  const { error } = await supabase.from(table).insert(payload)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  return { error: null, submitted: true }
}

export async function updateTransaction(
  id: string,
  kind: TransactionKind,
  _prevState: TransactionFormState,
  formData: FormData
): Promise<TransactionFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(kind, formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const { table, payload } = buildPayload(parsed)
  const { error } = await supabase.from(table).update(payload).eq('id', id)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/transactions')
  revalidatePath('/accounts')
  return { error: null, submitted: true }
}

export async function deleteTransaction(id: string, kind: TransactionKind): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const table = kind === 'income' ? 'income' : 'expenses'
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/transactions')
  revalidatePath('/accounts')
}
