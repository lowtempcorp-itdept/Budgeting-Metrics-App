import { describe, it, expect } from 'vitest'
import { formatCurrency } from './format'

describe('formatCurrency', () => {
  it('formats whole pesos with the peso sign and thousands separators', () => {
    expect(formatCurrency(1234)).toBe('₱1,234.00')
  })

  it('formats cents correctly', () => {
    expect(formatCurrency(1234.5)).toBe('₱1,234.50')
  })

  it('formats negative amounts with a leading minus before the sign', () => {
    expect(formatCurrency(-500)).toBe('-₱500.00')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('₱0.00')
  })
})
