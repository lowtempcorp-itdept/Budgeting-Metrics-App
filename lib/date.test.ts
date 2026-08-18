import { describe, it, expect } from 'vitest'
import { todayInManila, currentMonthInManila } from './date'

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
