'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, label, isDark }: { href: string; label: string; isDark?: boolean }) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex flex-col items-center py-2 text-xs ${
        isDark
          ? isActive
            ? 'font-medium text-white'
            : 'text-white/60 hover:text-white'
          : isActive
            ? 'font-medium text-slate-900'
            : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
  )
}
