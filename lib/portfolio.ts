export type PortfolioTransactionRow = {
  type: 'buy' | 'sell' | 'deposit' | 'withdraw'
  ticker: string | null
  company: string | null
  amount: number
}

export type TickerNetPosition = {
  label: string
  netAmount: number
}

export function computeNetByTicker(rows: PortfolioTransactionRow[]): TickerNetPosition[] {
  const totals = new Map<string, number>()
  const order: string[] = []

  for (const row of rows) {
    const label = row.ticker?.trim() || row.company?.trim() || 'Uncategorized'
    if (!totals.has(label)) {
      totals.set(label, 0)
      order.push(label)
    }
    const sign = row.type === 'buy' || row.type === 'deposit' ? 1 : -1
    totals.set(label, totals.get(label)! + sign * row.amount)
  }

  return order
    .map((label) => ({ label, netAmount: totals.get(label)! }))
    .sort((a, b) => b.netAmount - a.netAmount)
}
