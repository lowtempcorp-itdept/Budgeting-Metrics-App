import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShellChrome } from './ShellChrome'
import { QuickAddProvider } from './quick-add/QuickAddProvider'
import { mostRecentAccountId, rankCategoriesByUsage } from '@/lib/transactions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [accountsResult, categoriesResult, recentIncomeResult, recentExpenseResult, recentCategoryUseResult] =
    await Promise.all([
      supabase.from('accounts').select('id, name, archived').order('name'),
      supabase.from('categories').select('id, name, archived').order('name'),
      supabase.from('income').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('expenses').select('account_id, created_at').order('created_at', { ascending: false }).limit(1),
      supabase
        .from('expenses')
        .select('category_id')
        .not('category_id', 'is', null)
        .gte('occurred_on', ninetyDaysAgo.toISOString().slice(0, 10)),
    ])

  for (const result of [accountsResult, categoriesResult, recentIncomeResult, recentExpenseResult, recentCategoryUseResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const accounts = accountsResult.data ?? []
  const categories = categoriesResult.data ?? []

  const recentUses = [
    ...(recentIncomeResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
    ...(recentExpenseResult.data ?? []).map((row) => ({ accountId: row.account_id, createdAt: row.created_at })),
  ]
  const defaultAccountId = mostRecentAccountId(recentUses)

  const rankedCategoryIds = rankCategoriesByUsage(
    (recentCategoryUseResult.data ?? []).map((row) => row.category_id as string)
  )

  return (
    <QuickAddProvider
      accounts={accounts}
      categories={categories}
      defaultAccountId={defaultAccountId}
      rankedCategoryIds={rankedCategoryIds}
    >
      <ShellChrome>{children}</ShellChrome>
    </QuickAddProvider>
  )
}
