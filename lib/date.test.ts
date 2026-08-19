import { describe, it, expect } from 'vitest'
import { todayInManila, currentMonthInManila, monthsAgoInManila } from './date'

describe('todayInManila', () => {
  it('returns the Manila calendar date, one day ahead of a UTC date that has not rolled over yet', () => {
    // 2026-08-18T17:00:00Z is 2026-08-19T01:00:00 in Asia/Manila (UTC+8) —
    // this is exactly the class of bug this helper exists to prevent.
    const reference = new Date('2026-08-18T17:00:00Z')
    expect(todayInManila(reference)).toBe('2026-08-19')
  })

  it('matches the UTC date when well within the Manila day', () => {
    const reference = new Date('2026-08-18T02:00:00Z') // 10:00 in Manila
    expect(todayInManila(reference)).toBe('2026-08-18')
  })

  it('defaults to the current instant when no reference date is given', () => {
    expect(todayInManila()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('currentMonthInManila', () => {
  it('returns the 1st of the Manila calendar month', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(currentMonthInManila(reference)).toBe('2026-08-01')
  })

  it('rolls over to the next month at the Manila month boundary, ahead of UTC', () => {
    // 2026-08-31T17:00:00Z is 2026-09-01T01:00:00 in Asia/Manila.
    const reference = new Date('2026-08-31T17:00:00Z')
    expect(currentMonthInManila(reference)).toBe('2026-09-01')
  })
})

describe('monthsAgoInManila', () => {
  it('returns the current month when n is 0', () => {
    const reference = new Date('2026-08-15T02:00:00Z') // Aug 15 in Manila
    expect(monthsAgoInManila(0, reference)).toBe('2026-08-01')
  })

  it('returns a prior month within the same year', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(monthsAgoInManila(3, reference)).toBe('2026-05-01')
  })

  it('rolls back across a year boundary', () => {
    const reference = new Date('2026-02-10T02:00:00Z') // Feb 2026 in Manila
    expect(monthsAgoInManila(3, reference)).toBe('2025-11-01')
  })

  it('rolls back a full year for n=12', () => {
    const reference = new Date('2026-08-15T02:00:00Z')
    expect(monthsAgoInManila(12, reference)).toBe('2025-08-01')
  })
})
