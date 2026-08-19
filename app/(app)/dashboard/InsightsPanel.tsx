import type { Insight } from '@/lib/insights'
import { formatCurrency } from '@/lib/format'

const MARKS: Record<Insight['kind'], string> = {
  'highest-spend-month': '“',
  'budget-pace': '↗',
  'top-category': '★',
  'dormant-account': '–',
  'months-under-budget': '✓',
}

function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00`).toLocaleDateString('en-US', { month: 'long' })
}

function describe(insight: Insight): React.ReactNode {
  switch (insight.kind) {
    case 'highest-spend-month':
      return (
        <>
          <strong>{monthLabel(insight.month)}</strong> was your highest-spend month this half-year —{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.monthTotal)}</span>. The single biggest push was{' '}
          <strong>{insight.topLabel}</strong> at <span className="font-ledger-mono">{formatCurrency(insight.topAmount)}</span>.
        </>
      )
    case 'budget-pace': {
      const pacing = insight.projected <= insight.budget ? 'under' : 'over'
      return (
        <>
          You&rsquo;re pacing <strong>{pacing} budget</strong> this month —{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.spentSoFar)}</span> spent so far, projected to land
          near <span className="font-ledger-mono">{formatCurrency(insight.projected)}</span> against a{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.budget)}</span> budget.
        </>
      )
    }
    case 'top-category':
      return (
        <>
          <strong>{insight.categoryName}</strong> has topped your spending {insight.toppedMonths} of the last{' '}
          {insight.windowMonths} months, averaging{' '}
          <span className="font-ledger-mono">{formatCurrency(insight.averagePerMonth)}</span>/mo.
        </>
      )
    case 'dormant-account':
      return (
        <>
          <strong>{insight.accountName}</strong> hasn&rsquo;t moved in {insight.daysSinceActivity} days.
        </>
      )
    case 'months-under-budget':
      return (
        <>
          You stayed under budget in <strong>{insight.underCount} of the last {insight.consideredCount}</strong> months.
        </>
      )
  }
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length < 2) {
    return (
      <div className="dash-panel dash-enter font-ledger-sans rounded-2xl p-5 text-sm text-[#c3c9dd]">
        Add more transactions to see insights here.
      </div>
    )
  }

  return (
    <div className="dash-panel dash-enter rounded-2xl p-5">
      <h2 className="font-ledger-serif mb-3 flex items-baseline justify-between text-[16px] text-[#f9f6ee]">
        What stood out
        <span className="font-ledger-sans text-[11px] font-normal text-[#b9bdcb]">Auto-generated</span>
      </h2>
      <div className="flex flex-col">
        {insights.map((insight, i) => (
          <div
            key={insight.kind}
            className={`font-ledger-sans flex gap-3 py-2.5 text-[13px] leading-relaxed text-[#ece6d8] ${
              i > 0 ? 'border-t border-white/10' : ''
            }`}
          >
            <span className="font-ledger-serif w-5 flex-none text-center text-[22px] text-[#f0b854]">
              {MARKS[insight.kind]}
            </span>
            <span>{describe(insight)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
