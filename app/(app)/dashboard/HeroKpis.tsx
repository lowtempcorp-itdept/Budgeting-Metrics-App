import { CountUp } from './CountUp'
import { formatCurrency } from '@/lib/format'

export function HeroKpis({
  total,
  incomeMtd,
  expenseMtd,
  netMtd,
  budgetPercentUsed,
}: {
  total: number
  incomeMtd: number
  expenseMtd: number
  netMtd: number
  budgetPercentUsed: number | null
}) {
  return (
    <div className="dash-panel font-ledger-serif grid grid-cols-1 gap-5 rounded-2xl p-5 sm:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="font-ledger-sans text-[10.5px] uppercase tracking-[0.1em] text-[#b9bdcb]">
          Total across accounts
        </p>
        <p className="mt-1 text-[40px] leading-none text-[#9cbaf0]">
          <CountUp value={total} />
        </p>
      </div>
      <div className="flex">
        <div className="flex-1 border-l border-white/15 pl-4 first:border-l-0 first:pl-0">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Income (MTD)</p>
          <p className="text-[18px] font-semibold text-[#6cd3a5]">{formatCurrency(incomeMtd)}</p>
        </div>
        <div className="flex-1 border-l border-white/15 pl-4">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Expenses (MTD)</p>
          <p className="text-[18px] font-semibold text-[#ed8264]">{formatCurrency(expenseMtd)}</p>
          {budgetPercentUsed !== null && (
            <p className="font-ledger-sans mt-1 text-[11px] text-[#b9bdcb]">{budgetPercentUsed}% of budget used</p>
          )}
        </div>
        <div className="flex-1 border-l border-white/15 pl-4">
          <p className="font-ledger-sans text-[9.5px] uppercase tracking-[0.08em] text-[#b9bdcb]">Net (MTD)</p>
          <p className={`text-[18px] font-semibold ${netMtd < 0 ? 'text-[#ed8264]' : 'text-[#6cd3a5]'}`}>
            {formatCurrency(netMtd)}
          </p>
        </div>
      </div>
    </div>
  )
}
