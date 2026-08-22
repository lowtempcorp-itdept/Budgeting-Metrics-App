'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { computeInitialNextDueOn, advanceNextDueOn, type RecurringFrequency } from '@/lib/recurring'
import { todayInManila } from '@/lib/date'

export type RecurringConstantFormState = {
  error: string | null
  submitted: boolean
}

type ParsedConstant =
  | {
      ok: true
      kind: 'expense' | 'income'
      amount: number
      frequency: RecurringFrequency
      dayOfMonth: number
      monthOfYear: number | null
      accountId: string
      categoryId: string | null
      source: string | null
      notes: string | null
    }
  | { ok: false; error: string }

function parseFields(formData: FormData): ParsedConstant {
  const kindRaw = formData.get('kind')
  const kind = kindRaw === 'income' ? 'income' : 'expense'

  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' }
  }

  const frequencyRaw = formData.get('frequency')
  const frequency: RecurringFrequency = frequencyRaw === 'yearly' ? 'yearly' : 'monthly'

  const dayOfMonth = Number(formData.get('dayOfMonth'))
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, error: 'Day of month must be between 1 and 31.' }
  }

  let monthOfYear: number | null = null
  if (frequency === 'yearly') {
    monthOfYear = Number(formData.get('monthOfYear'))
    if (!Number.isInteger(monthOfYear) || monthOfYear < 1 || monthOfYear > 12) {
      return { ok: false, error: 'Month is required for a yearly constant.' }
    }
  }

  const accountId = formData.get('accountId')
  if (typeof accountId !== 'string' || accountId.length === 0) {
    return { ok: false, error: 'Account is required.' }
  }

  const notesRaw = formData.get('notes')
  const notes = typeof notesRaw === 'string' && notesRaw.trim().length > 0 ? notesRaw.trim() : null

  if (kind === 'expense') {
    const categoryId = formData.get('categoryId')
    if (typeof categoryId !== 'string' || categoryId.length === 0) {
      return { ok: false, error: 'Category is required for an expense constant.' }
    }
    return { ok: true, kind, amount, frequency, dayOfMonth, monthOfYear, accountId, categoryId, source: null, notes }
  }

  const source = formData.get('source')
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'Source is required for an income constant.' }
  }
  return {
    ok: true,
    kind,
    amount,
    frequency,
    dayOfMonth,
    monthOfYear,
    accountId,
    categoryId: null,
    source: source.trim(),
    notes,
  }
}

export async function addRecurringConstant(
  _prevState: RecurringConstantFormState,
  formData: FormData
): Promise<RecurringConstantFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const nextDueOn = computeInitialNextDueOn(parsed.frequency, parsed.dayOfMonth, parsed.monthOfYear, todayInManila())

  const { error } = await supabase.from('recurring_constants').insert({
    kind: parsed.kind,
    amount: parsed.amount,
    frequency: parsed.frequency,
    day_of_month: parsed.dayOfMonth,
    month_of_year: parsed.monthOfYear,
    account_id: parsed.accountId,
    category_id: parsed.categoryId,
    source: parsed.source,
    notes: parsed.notes,
    next_due_on: nextDueOn,
  })
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/budget')
  return { error: null, submitted: true }
}

export async function updateRecurringConstant(
  id: string,
  _prevState: RecurringConstantFormState,
  formData: FormData
): Promise<RecurringConstantFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.', submitted: true }

  const parsed = parseFields(formData)
  if (!parsed.ok) return { error: parsed.error, submitted: true }

  const { data: existing, error: fetchError } = await supabase
    .from('recurring_constants')
    .select('frequency, day_of_month, month_of_year, next_due_on')
    .eq('id', id)
    .single()
  if (fetchError) return { error: fetchError.message, submitted: true }

  // Editing only ever affects future occurrences. If the schedule itself
  // didn't change, next_due_on must not be touched — recomputing it
  // unconditionally would rewind an already-advanced date (e.g. the
  // catch-up just posted today's occurrence and moved next_due_on
  // forward) back to today, causing a duplicate post on the very next
  // page load. If the schedule did change, recompute it fresh — but if
  // that recompute would land today-or-earlier while the stored value was
  // still in the future, advance one more period instead of re-arming an
  // occurrence for immediate re-posting.
  const scheduleChanged =
    existing.frequency !== parsed.frequency ||
    existing.day_of_month !== parsed.dayOfMonth ||
    existing.month_of_year !== parsed.monthOfYear

  let nextDueOn = existing.next_due_on
  if (scheduleChanged) {
    const today = todayInManila()
    const recomputed = computeInitialNextDueOn(parsed.frequency, parsed.dayOfMonth, parsed.monthOfYear, today)
    nextDueOn =
      recomputed <= today && existing.next_due_on > today
        ? advanceNextDueOn(recomputed, parsed.frequency, parsed.dayOfMonth, parsed.monthOfYear)
        : recomputed
  }

  const { error } = await supabase
    .from('recurring_constants')
    .update({
      kind: parsed.kind,
      amount: parsed.amount,
      frequency: parsed.frequency,
      day_of_month: parsed.dayOfMonth,
      month_of_year: parsed.monthOfYear,
      account_id: parsed.accountId,
      category_id: parsed.categoryId,
      source: parsed.source,
      notes: parsed.notes,
      next_due_on: nextDueOn,
    })
    .eq('id', id)
  if (error) return { error: error.message, submitted: true }

  revalidatePath('/budget')
  return { error: null, submitted: true }
}

export async function setRecurringConstantActive(id: string, active: boolean): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { error } = await supabase.from('recurring_constants').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function deleteRecurringConstant(id: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')

  const { error } = await supabase.from('recurring_constants').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}
