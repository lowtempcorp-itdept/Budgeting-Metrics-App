import { describe, it, expect } from 'vitest'
import { computeAccountBalances, mostRecentAccountId, rankCategoriesByUsage } from './transactions'

describe('computeAccountBalances', () => {
  it('sums income minus expenses per account', () => {
    const balances = computeAccountBalances(
      ['acc-1', 'acc-2'],
      [
        { accountId: 'acc-1', amount: 1000 },
        { accountId: 'acc-1', amount: 500 },
      ],
      [
        { accountId: 'acc-1', amount: 200 },
        { accountId: 'acc-2', amount: 50 },
      ]
    )
    expect(balances).toEqual({ 'acc-1': 1300, 'acc-2': -50 })
  })

  it('returns zero for an account with no transactions', () => {
    expect(computeAccountBalances(['acc-1'], [], [])).toEqual({ 'acc-1': 0 })
  })

  it('includes balance-adjustment rows in the sum like any other transaction', () => {
    // Adjustments are just income/expense rows with is_adjustment=true —
    // this function doesn't need to know about that flag; the caller
    // already decided which rows to include.
    const balances = computeAccountBalances(['acc-1'], [{ accountId: 'acc-1', amount: 100 }], [])
    expect(balances).toEqual({ 'acc-1': 100 })
  })
})

describe('mostRecentAccountId', () => {
  it('returns null when there are no transactions', () => {
    expect(mostRecentAccountId([])).toBeNull()
  })

  it('returns the account of the most recently created transaction', () => {
    const result = mostRecentAccountId([
      { accountId: 'acc-1', createdAt: '2026-08-01T10:00:00Z' },
      { accountId: 'acc-2', createdAt: '2026-08-10T10:00:00Z' },
      { accountId: 'acc-1', createdAt: '2026-08-05T10:00:00Z' },
    ])
    expect(result).toBe('acc-2')
  })
})

describe('rankCategoriesByUsage', () => {
  it('ranks categories by descending frequency', () => {
    const result = rankCategoriesByUsage(['coffee', 'food', 'coffee', 'coffee', 'food'])
    expect(result).toEqual(['coffee', 'food'])
  })

  it('breaks ties by first appearance', () => {
    const result = rankCategoriesByUsage(['food', 'coffee'])
    expect(result).toEqual(['food', 'coffee'])
  })

  it('returns an empty array for no usage', () => {
    expect(rankCategoriesByUsage([])).toEqual([])
  })
})
