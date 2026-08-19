'use client'

import { useEffect, useRef, useState } from 'react'
import { interpolateCount } from '@/lib/motion'
import { formatCurrency } from '@/lib/format'

export function CountUp({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const start = performance.now()
    function tick(now: number) {
      const progress = (now - start) / durationMs
      setDisplay(interpolateCount(value, progress))
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [value, durationMs])

  return <span className="tabular-nums">{formatCurrency(display)}</span>
}
