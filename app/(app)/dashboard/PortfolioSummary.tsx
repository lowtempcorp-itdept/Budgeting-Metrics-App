import { formatCurrency } from '@/lib/format'
import type { TickerNetPosition } from '@/lib/portfolio'
import { TAPPABLE_CLASS } from '@/lib/motion'

const DOT_COLORS = ['#9cbaf0', '#f0b854', '#d99fc0', '#9aa3b8']

export function PortfolioSummary({ positions }: { positions: TickerNetPosition[] }) {
  return (
    <div className="dash-panel rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        Portfolio
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">Money moved, not live value</span>
      </h2>
      {positions.length === 0 ? (
        <p className="font-ledger-sans text-sm text-[#c3c9dd]">No portfolio activity yet.</p>
      ) : (
        <div className="flex flex-col">
          {positions.map((position, i) => (
            <div
              key={position.label}
              className={`${TAPPABLE_CLASS} font-ledger-sans flex items-center gap-2.5 py-1.5 text-[13px] text-[#ece6d8] ${
                i > 0 ? 'border-t border-white/10' : ''
              }`}
            >
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
              />
              <span className="flex-1">{position.label}</span>
              <span className="font-ledger-mono font-semibold">
                {formatCurrency(Math.abs(position.netAmount))} net {position.netAmount >= 0 ? 'in' : 'out'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
