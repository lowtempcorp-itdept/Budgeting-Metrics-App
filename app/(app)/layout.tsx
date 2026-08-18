import Link from 'next/link'
import { logout } from './actions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold text-slate-900">Personal Finance </span>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
            Log out
          </button>
        </form>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <nav className="grid grid-cols-5 border-t border-slate-200 bg-white">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center py-2 text-xs text-slate-600 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
