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

export async function addAccount(formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const name = formData.get('name')
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Account name is required.')
  }

  const { error } = await supabase.from('accounts').insert({ name: name.trim() })
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function setAccountArchived(id: string, archived: boolean): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('accounts').update({ archived }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function addCategory(formData: FormData): Promise<void> {
  const supabase = await requireUser()
  const name = formData.get('name')
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Category name is required.')
  }

  const { error } = await supabase.from('categories').insert({ name: name.trim() })
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<void> {
  const supabase = await requireUser()
  const { error } = await supabase.from('categories').update({ archived }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/accounts')
}
