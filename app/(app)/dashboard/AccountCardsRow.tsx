import { formatCurrency } from '@/lib/format'
import { TAPPABLE_CLASS } from '@/lib/motion'

const CARD_COLORS = ['#f0b854', '#9cbaf0', '#d99fc0', '#6cd3a5']

export function AccountCardsRow({ accounts }: { accounts: Array<{ id: string; name: string; balance: number }> }) {
  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 text-[16px] text-[#f9f6ee]">By account</h2>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {accounts.map((account, i) => (
          <div
            key={account.id}
            tabIndex={0}
            className={`${TAPPABLE_CLASS} w-32 flex-none rounded-2xl border border-white/10 bg-white/5 p-3`}
          >
            <div
              className="font-ledger-serif mb-3 flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold text-[#12151b]"
              style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
            >
              {account.name.slice(0, 1)}
            </div>
            <p className="font-ledger-sans mb-0.5 text-[11px] text-[#c3c7d3]">{account.name}</p>
            <p className="font-ledger-mono text-[15px] font-bold text-[#f9f6ee]">{formatCurrency(account.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
