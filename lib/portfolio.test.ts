import { describe, it, expect } from 'vitest'
import { computeNetByTicker, type PortfolioTransactionRow } from './portfolio'

describe('computeNetByTicker', () => {
  it('adds buys and deposits, subtracts sells and withdrawals, grouped by ticker', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: 'AAPL', company: 'Apple', amount: 10000 },
      { type: 'buy', ticker: 'AAPL', company: 'Apple', amount: 2400 },
      { type: 'sell', ticker: 'AAPL', company: 'Apple', amount: 1000 },
      { type: 'deposit', ticker: 'VOO', company: null, amount: 9000 },
      { type: 'withdraw', ticker: 'VOO', company: null, amount: 100 },
    ]
    const result = computeNetByTicker(rows)
    expect(result).toEqual([
      { label: 'AAPL', netAmount: 11400 },
      { label: 'VOO', netAmount: 8900 },
    ])
  })

  it('sorts results descending by net amount', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: 'BDO', company: null, amount: 3200 },
      { type: 'buy', ticker: 'AAPL', company: null, amount: 12400 },
    ]
    expect(computeNetByTicker(rows).map((r) => r.label)).toEqual(['AAPL', 'BDO'])
  })

  it('falls back to company name, then "Uncategorized", when ticker is missing', () => {
    const rows: PortfolioTransactionRow[] = [
      { type: 'buy', ticker: null, company: 'Some Bank', amount: 500 },
      { type: 'buy', ticker: null, company: null, amount: 250 },
    ]
    const result = computeNetByTicker(rows)
    expect(result).toEqual([
      { label: 'Some Bank', netAmount: 500 },
      { label: 'Uncategorized', netAmount: 250 },
    ])
  })

  it('returns an empty array for no transactions', () => {
    expect(computeNetByTicker([])).toEqual([])
  })
})
