'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in.')
  return supabase
}

function parseAmount(formData: FormData): number {
  const amount = Number(formData.get('amount'))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }
  return amount
}

export async function setWeeklyBudget(weekStart: string, formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const amount = parseAmount(formData)

  const { error } = await supabase
    .from('weekly_budgets')
    .upsert({ week_start: weekStart, planned_amount: amount }, { onConflict: 'user_id,week_start' })
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function setCategoryBudget(month: string, categoryId: string, formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const amount = parseAmount(formData)

  const { error } = await supabase
    .from('budgets')
    .upsert({ month, category_id: categoryId, planned_amount: amount }, { onConflict: 'user_id,month,category_id' })
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}

export async function removeCategoryBudget(month: string, categoryId: string): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('budgets').delete().eq('month', month).eq('category_id', categoryId)
  if (error) throw new Error(error.message)

  revalidatePath('/budget')
}
