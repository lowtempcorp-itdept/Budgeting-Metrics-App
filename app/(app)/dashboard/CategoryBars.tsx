import { formatCurrency } from '@/lib/format'

export function CategoryBars({ categories }: { categories: Array<{ name: string; amount: number }> }) {
  const max = Math.max(...categories.map((c) => c.amount), 1)

  return (
    <div className="dash-panel rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        By category
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">MTD</span>
      </h2>
      {categories.length === 0 ? (
        <p className="font-ledger-sans text-sm text-[#c3c9dd]">No spending yet this month.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <div key={category.name} className="grid grid-cols-[120px_1fr_auto] items-center gap-3">
              <span className="font-ledger-sans truncate text-[12.5px] text-[#ece6d8]">{category.name}</span>
              <div className="h-3 rounded-r bg-white/10">
                <div
                  className="h-full rounded-r bg-[#9cbaf0]"
                  style={{ width: `${(category.amount / max) * 100}%` }}
                />
              </div>
              <span className="font-ledger-mono text-right text-[12px] text-[#b9bdcb]">
                {formatCurrency(category.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
