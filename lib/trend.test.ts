import { describe, it, expect } from 'vitest'
import { computeTrend } from './trend'

describe('computeTrend', () => {
  const reference = new Date('2026-08-15T02:00:00Z') // Aug 2026 in Manila

  it('groups income and expenses by month, oldest to newest, including the current partial month', () => {
    const income = [
      { occurredOn: '2026-06-05', amount: 1000 },
      { occurredOn: '2026-07-10', amount: 2000 },
      { occurredOn: '2026-08-01', amount: 500 },
    ]
    const expenses = [
      { occurredOn: '2026-06-20', amount: 300 },
      { occurredOn: '2026-08-10', amount: 100 },
    ]
    const result = computeTrend(3, income, expenses, reference)
    expect(result).toEqual([
      { month: '2026-06-01', income: 1000, expense: 300 },
      { month: '2026-07-01', income: 2000, expense: 0 },
      { month: '2026-08-01', income: 500, expense: 100 },
    ])
  })

  it('returns zeros for months with no matching rows', () => {
    const result = computeTrend(2, [], [], reference)
    expect(result).toEqual([
      { month: '2026-07-01', income: 0, expense: 0 },
      { month: '2026-08-01', income: 0, expense: 0 },
    ])
  })

  it('ignores rows outside the requested window', () => {
    const income = [{ occurredOn: '2026-01-15', amount: 9999 }]
    const result = computeTrend(1, income, [], reference)
    expect(result).toEqual([{ month: '2026-08-01', income: 0, expense: 0 }])
  })
})
