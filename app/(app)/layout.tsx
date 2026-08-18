import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'
import { NavLink } from './NavLink'
import { QuickAddProvider } from './quick-add/QuickAddProvider'
import { mostRecentAccountId, rankCategoriesByUsage } from '@/lib/transactions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

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
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <span className="font-semibold text-slate-900">Personal Finance</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Log out
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 pb-24">{children}</main>

        <nav className="sticky bottom-0 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </div>
    </QuickAddProvider>
  )
}
