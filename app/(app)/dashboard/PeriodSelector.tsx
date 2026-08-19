'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { TAPPABLE_CLASS } from '@/lib/motion'

const OPTIONS = [3, 6, 9, 12]

export function PeriodSelector({ months }: { months: number }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  function choose(value: number) {
    setOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('months', String(value))
    router.push(`/dashboard?${params.toString()}`)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${TAPPABLE_CLASS} font-ledger-sans inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11.5px] font-semibold text-[#c3c9dd]`}
      >
        {months} months <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-[#1a1e26]">
          {OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className="font-ledger-sans px-4 py-2 text-left text-[12.5px] text-[#c3c9dd] hover:bg-white/10"
            >
              {value} months
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
