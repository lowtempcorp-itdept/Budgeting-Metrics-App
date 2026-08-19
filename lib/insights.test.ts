import { describe, it, expect } from 'vitest'
import { computeInsights, type InsightExpenseRow, type InsightAccount, type InsightBudgetRow } from './insights'

const reference = new Date('2026-08-19T02:00:00Z') // Aug 19, 2026 in Manila — matches the design spec's worked example

function expense(overrides: Partial<InsightExpenseRow>): InsightExpenseRow {
  return {
    occurredOn: '2026-06-15',
    amount: 100,
    categoryId: 'cat-food',
    notes: null,
    isAdjustment: false,
    ...overrides,
  }
}

const categoryNames = { 'cat-food': 'Food', 'cat-errands': 'Errands' }

describe('computeInsights — highest-spend-month', () => {
  it('picks the complete month (within the last 6) with the largest non-adjustment expense total', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-10', amount: 5000, notes: 'Hotel' }),
      expense({ occurredOn: '2026-06-11', amount: 500 }),
      expense({ occurredOn: '2026-07-05', amount: 1000 }),
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'highest-spend-month')
    expect(found).toEqual({
      kind: 'highest-spend-month',
      month: '2026-06-01',
      monthTotal: 5500,
      topLabel: 'Hotel',
      topAmount: 5000,
    })
  })

  it('falls back to the category name when the top expense has no notes', () => {
    const expenses = [expense({ occurredOn: '2026-06-10', amount: 5000, notes: null, categoryId: 'cat-food' })]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'highest-spend-month')
    expect(found).toMatchObject({ topLabel: 'Food' })
  })

  it('excludes adjustment rows and the current in-progress month', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-10', amount: 9999, isAdjustment: true }),
      expense({ occurredOn: '2026-08-01', amount: 9999 }), // current month, excluded from the window
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'highest-spend-month')).toBeUndefined()
  })

  it('is omitted when there is no expense data in the window', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'highest-spend-month')).toBeUndefined()
  })
})

describe('computeInsights — budget-pace', () => {
  it('reports pacing under budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-10', amount: 1900 })] // day 10 of 19 elapsed, Aug has 31 days
    const budgets: InsightBudgetRow[] = [{ month: '2026-08-01', plannedAmount: 35000 }]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    const found = insights.find((i) => i.kind === 'budget-pace')
    expect(found).toMatchObject({ kind: 'budget-pace', spentSoFar: 1900, budget: 35000 })
    if (found?.kind === 'budget-pace') {
      expect(found.projected).toBeCloseTo((1900 / 19) * 31, 1)
      expect(found.projected).toBeLessThan(found.budget)
    }
  })

  it('reports pacing over budget', () => {
    const expenses = [expense({ occurredOn: '2026-08-05', amount: 30000 })]
    const budgets: InsightBudgetRow[] = [{ month: '2026-08-01', plannedAmount: 35000 }]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    const found = insights.find((i) => i.kind === 'budget-pace')
    if (found?.kind === 'budget-pace') expect(found.projected).toBeGreaterThan(found.budget)
    else throw new Error('expected a budget-pace insight')
  })

  it('is omitted when no budget rows exist for the current month', () => {
    const expenses = [expense({ occurredOn: '2026-08-05', amount: 100 })]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'budget-pace')).toBeUndefined()
  })
})

describe('computeInsights — top-category', () => {
  it('picks the category that topped the most complete months in the window, averaged over the full window', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-01', amount: 500, categoryId: 'cat-food' }),
      expense({ occurredOn: '2026-06-02', amount: 100, categoryId: 'cat-errands' }),
      expense({ occurredOn: '2026-07-01', amount: 500, categoryId: 'cat-food' }),
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets: [], referenceDate: reference })
    const found = insights.find((i) => i.kind === 'top-category')
    expect(found).toMatchObject({
      kind: 'top-category',
      categoryName: 'Food',
      toppedMonths: 2,
      windowMonths: 6,
      averagePerMonth: 1000 / 6,
    })
  })

  it('is omitted when there is no expense data in the window', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'top-category')).toBeUndefined()
  })
})

describe('computeInsights — dormant-account', () => {
  it('flags a non-archived account inactive for 10+ days', () => {
    const accounts: InsightAccount[] = [
      { id: 'acc-1', name: 'Maribank', archived: false, lastActivityOn: '2026-08-08' }, // 11 days before Aug 19
      { id: 'acc-2', name: 'Cash', archived: false, lastActivityOn: '2026-08-18' },
    ]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toEqual({
      kind: 'dormant-account',
      accountName: 'Maribank',
      daysSinceActivity: 11,
    })
  })

  it('ignores archived accounts and accounts with no activity ever', () => {
    const accounts: InsightAccount[] = [
      { id: 'acc-1', name: 'Old Wallet', archived: true, lastActivityOn: '2026-01-01' },
      { id: 'acc-2', name: 'Brand New', archived: false, lastActivityOn: null },
    ]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toBeUndefined()
  })

  it('is omitted when every active account has activity within 10 days', () => {
    const accounts: InsightAccount[] = [{ id: 'acc-1', name: 'Cash', archived: false, lastActivityOn: '2026-08-18' }]
    const insights = computeInsights({ expenses: [], categoryNames, accounts, budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'dormant-account')).toBeUndefined()
  })
})

describe('computeInsights — months-under-budget', () => {
  it('counts complete months (with budget data) that came in under budget', () => {
    const expenses = [
      expense({ occurredOn: '2026-06-05', amount: 100 }), // under its 200 budget
      expense({ occurredOn: '2026-07-05', amount: 300 }), // over its 200 budget
    ]
    const budgets: InsightBudgetRow[] = [
      { month: '2026-06-01', plannedAmount: 200 },
      { month: '2026-07-01', plannedAmount: 200 },
    ]
    const insights = computeInsights({ expenses, categoryNames, accounts: [], budgets, referenceDate: reference })
    expect(insights.find((i) => i.kind === 'months-under-budget')).toEqual({
      kind: 'months-under-budget',
      underCount: 1,
      consideredCount: 2,
    })
  })

  it('is omitted when no month in the window has budget data', () => {
    const insights = computeInsights({ expenses: [], categoryNames, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.find((i) => i.kind === 'months-under-budget')).toBeUndefined()
  })
})

describe('computeInsights — overall', () => {
  it('returns fewer than 2 insights when there is no transaction history at all', () => {
    const insights = computeInsights({ expenses: [], categoryNames: {}, accounts: [], budgets: [], referenceDate: reference })
    expect(insights.length).toBeLessThan(2)
  })
})
