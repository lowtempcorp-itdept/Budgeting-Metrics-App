import { describe, it, expect } from 'vitest'
import { computeInitialNextDueOn, advanceNextDueOn } from './recurring'

describe('computeInitialNextDueOn — monthly', () => {
  it('uses this month when the due day has not passed yet', () => {
    expect(computeInitialNextDueOn('monthly', 20, null, '2026-08-10')).toBe('2026-08-20')
  })

  it('is today when the due day is today', () => {
    expect(computeInitialNextDueOn('monthly', 10, null, '2026-08-10')).toBe('2026-08-10')
  })

  it('skips to next month when the due day already passed', () => {
    expect(computeInitialNextDueOn('monthly', 5, null, '2026-08-10')).toBe('2026-09-05')
  })

  it('rolls over a year boundary', () => {
    expect(computeInitialNextDueOn('monthly', 5, null, '2026-12-10')).toBe('2027-01-05')
  })

  it('clamps a day that does not exist in the target month', () => {
    expect(computeInitialNextDueOn('monthly', 31, null, '2026-02-01')).toBe('2026-02-28') // 2026 is not a leap year
  })
})

describe('computeInitialNextDueOn — yearly', () => {
  it('uses this year when the due date has not passed yet', () => {
    expect(computeInitialNextDueOn('yearly', 15, 12, '2026-08-10')).toBe('2026-12-15')
  })

  it('skips to next year when the due date already passed', () => {
    expect(computeInitialNextDueOn('yearly', 15, 4, '2026-08-10')).toBe('2027-04-15')
  })

  it('clamps a day that does not exist in the target month', () => {
    expect(computeInitialNextDueOn('yearly', 29, 2, '2026-01-01')).toBe('2026-02-28') // 2026 is not a leap year
  })
})

describe('advanceNextDueOn — monthly', () => {
  it('advances to the same day next month', () => {
    expect(advanceNextDueOn('2026-08-15', 'monthly', 15, null)).toBe('2026-09-15')
  })

  it('rolls over a year boundary', () => {
    expect(advanceNextDueOn('2026-12-15', 'monthly', 15, null)).toBe('2027-01-15')
  })

  it('clamps when the next month is shorter', () => {
    expect(advanceNextDueOn('2026-01-31', 'monthly', 31, null)).toBe('2026-02-28')
  })
})

describe('advanceNextDueOn — yearly', () => {
  it('advances to the same date next year', () => {
    expect(advanceNextDueOn('2026-04-15', 'yearly', 15, 4)).toBe('2027-04-15')
  })

  it('clamps a leap-day constant in a non-leap year', () => {
    expect(advanceNextDueOn('2028-02-29', 'yearly', 29, 2)).toBe('2029-02-28') // 2028 is a leap year, 2029 is not
  })
})
