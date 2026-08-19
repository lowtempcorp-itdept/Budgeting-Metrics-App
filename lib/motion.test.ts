import { describe, it, expect } from 'vitest'
import { easeOutCubic, interpolateCount } from './motion'

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('front-loads progress (decelerates toward the end)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe('interpolateCount', () => {
  it('returns 0 at progress 0 and the target at progress 1', () => {
    expect(interpolateCount(1000, 0)).toBe(0)
    expect(interpolateCount(1000, 1)).toBe(1000)
  })

  it('applies the easing curve at a midpoint', () => {
    // easeOutCubic(0.5) = 1 - 0.5^3 = 0.875 → 1000 * 0.875 = 875
    expect(interpolateCount(1000, 0.5)).toBe(875)
  })

  it('clamps progress outside [0, 1]', () => {
    expect(interpolateCount(1000, -0.5)).toBe(0)
    expect(interpolateCount(1000, 1.5)).toBe(1000)
  })
})
