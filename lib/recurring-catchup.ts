import type { SupabaseClient } from '@supabase/supabase-js'
import { advanceNextDueOn, type RecurringFrequency } from './recurring'
import { todayInManila } from './date'

type DueConstant = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  category_id: string | null
  account_id: string
  source: string | null
  notes: string | null
  frequency: RecurringFrequency
  day_of_month: number
  month_of_year: number | null
  next_due_on: string
}

// Runs on every authenticated page load (called from app/(app)/layout.tsx).
// Posts every occurrence that's come due since the last time the app was
// opened, dated to when each was actually due — not to today. A single
// UPDATE ... WHERE next_due_on = <the value we just read> claims each
// occurrence before posting it, so two concurrent tabs/requests can't both
// post the same one: whichever request's UPDATE affects zero rows lost the
// race and stops instead of double-posting.
export async function postDueRecurringConstants(supabase: SupabaseClient, referenceDate: Date = new Date()): Promise<void> {
  const today = todayInManila(referenceDate)

  const { data: due, error } = await supabase
    .from('recurring_constants')
    .select('id, kind, amount, category_id, account_id, source, notes, frequency, day_of_month, month_of_year, next_due_on')
    .eq('active', true)
    .lte('next_due_on', today)
  if (error) throw new Error(error.message)

  for (const constant of (due ?? []) as DueConstant[]) {
    let dueOn = constant.next_due_on
    while (dueOn <= today) {
      const nextDueOn = advanceNextDueOn(dueOn, constant.frequency, constant.day_of_month, constant.month_of_year)

      const { data: claimed, error: claimError } = await supabase
        .from('recurring_constants')
        .update({ next_due_on: nextDueOn })
        .eq('id', constant.id)
        .eq('next_due_on', dueOn)
        .select('id')
      if (claimError) throw new Error(claimError.message)
      if (!claimed || claimed.length === 0) break // another request already claimed this occurrence

      const basePayload = {
        occurred_on: dueOn,
        amount: constant.amount,
        account_id: constant.account_id,
        notes: constant.notes,
        recurring_constant_id: constant.id,
      }
      try {
        const { error: insertError } =
          constant.kind === 'expense'
            ? await supabase.from('expenses').insert({ ...basePayload, category_id: constant.category_id })
            : await supabase.from('income').insert({ ...basePayload, source: constant.source })
        if (insertError) throw new Error(insertError.message)
      } catch (insertErr) {
        // The claim above already advanced next_due_on past dueOn. If the
        // insert then fails, revert that claim so a future run retries this
        // occurrence instead of silently losing it from the ledger forever.
        const insertMessage = insertErr instanceof Error ? insertErr.message : String(insertErr)
        const { data: reverted, error: revertError } = await supabase
          .from('recurring_constants')
          .update({ next_due_on: dueOn })
          .eq('id', constant.id)
          .eq('next_due_on', nextDueOn)
          .select('id')
        if (revertError || !reverted || reverted.length === 0) {
          const revertMessage = revertError
            ? revertError.message
            : 'no matching row (next_due_on was no longer the claimed value)'
          throw new Error(
            `Failed to post recurring constant ${constant.id} for ${dueOn}: ${insertMessage}. Additionally failed to revert the claimed next_due_on back to ${dueOn}: ${revertMessage}. This occurrence may be lost — manual correction required.`
          )
        }
        throw new Error(`Failed to post recurring constant ${constant.id} for ${dueOn}: ${insertMessage}`)
      }

      dueOn = nextDueOn
    }
  }
}
