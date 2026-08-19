export const TAPPABLE_CLASS =
  'cursor-pointer transition-transform duration-150 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.06] active:scale-[0.94] active:duration-75'

export const STAGGER_DELAYS_MS = [0, 70, 140, 210, 280, 350]

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function interpolateCount(target: number, progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return Math.round(target * easeOutCubic(clamped))
}
