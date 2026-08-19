'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { NavLink } from './NavLink'
import { logout } from './actions'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budget', label: 'Budget' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/accounts', label: 'Accounts' },
]

export function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isHome = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <div className={`flex min-h-screen flex-col ${isHome ? 'bg-[#0a0d12]' : 'bg-slate-50'}`}>
      <header
        className={`flex items-center justify-between border-b px-4 py-3 ${
          isHome ? 'border-white/10 bg-[#0e1015] text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
      >
        <span className="font-semibold">Personal Finance</span>
        <form action={logout}>
          <button
            type="submit"
            className={`text-sm ${isHome ? 'text-white/60 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Log out
          </button>
        </form>
      </header>

      <main className="flex-1 p-4 pb-24">{children}</main>

      <nav
        className={`sticky bottom-0 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] ${
          isHome ? 'border-white/10 bg-[#0e1015]' : 'border-slate-200 bg-white'
        }`}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} isDark={isHome} />
        ))}
      </nav>
    </div>
  )
}
