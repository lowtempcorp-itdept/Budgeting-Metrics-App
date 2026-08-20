import { describe, it, expect } from 'vitest'
import {
  mondayOfWeek,
  addDays,
  deriveMonthlyBudget,
  deriveDailyBudget,
  computeLeftover,
  needsNextWeekReminder,
  formatWeekRange,
} from './weekly-budget'

describe('mondayOfWeek', () => {
  it('returns the same date when it is already a Monday', () => {
    expect(mondayOfWeek('2026-08-17')).toBe('2026-08-17')
  })

  it('returns the prior Monday for a mid-week date', () => {
    expect(mondayOfWeek('2026-08-19')).toBe('2026-08-17') // Wednesday
  })

  it('returns the prior Monday for a Sunday (end of the ISO week)', () => {
    expect(mondayOfWeek('2026-08-23')).toBe('2026-08-17')
  })

  it('handles a week that spans a month boundary', () => {
    expect(mondayOfWeek('2026-09-02')).toBe('2026-08-31') // Wednesday, week starts in August
  })
})

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-08-17', 6)).toBe('2026-08-23')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-08-29', 6)).toBe('2026-09-04')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-29', 6)).toBe('2027-01-04')
  })
})

describe('deriveMonthlyBudget / deriveDailyBudget', () => {
  it('derives monthly as weekly x4', () => {
    expect(deriveMonthlyBudget(2000)).toBe(8000)
  })

  it('derives daily as weekly /7', () => {
    expect(deriveDailyBudget(700)).toBeCloseTo(100, 5)
  })
})

describe('computeLeftover', () => {
  it('is positive when income exceeds budgeted', () => {
    expect(computeLeftover(5000, 2000)).toBe(3000)
  })

  it('is negative when budgeted exceeds income', () => {
    expect(computeLeftover(1000, 2000)).toBe(-1000)
  })
})

describe('needsNextWeekReminder', () => {
  const currentWeekStart = '2026-08-17' // Mon Aug 17 - Sun Aug 23

  it('is false when next week is already set, regardless of timing', () => {
    expect(needsNextWeekReminder('2026-08-23', currentWeekStart, true)).toBe(false)
  })

  it('is true on the last day of the week when next week is unset', () => {
    expect(needsNextWeekReminder('2026-08-23', currentWeekStart, false)).toBe(true) // Sunday, 0 days left
  })

  it('is true two days before the week ends', () => {
    expect(needsNextWeekReminder('2026-08-21', currentWeekStart, false)).toBe(true) // Friday, 2 days left
  })

  it('is false more than two days before the week ends', () => {
    expect(needsNextWeekReminder('2026-08-20', currentWeekStart, false)).toBe(false) // Thursday, 3 days left
  })
})

describe('formatWeekRange', () => {
  it('formats a week entirely within one month', () => {
    expect(formatWeekRange('2026-08-17')).toBe('Aug 17–23')
  })

  it('formats a week that spans two months', () => {
    expect(formatWeekRange('2026-08-31')).toBe('Aug 31–Sep 6')
  })
})
