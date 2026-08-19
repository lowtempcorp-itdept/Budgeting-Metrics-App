'use client'

import { useRef, useState } from 'react'
import { formatCurrency } from '@/lib/format'
import type { TrendMonthPoint } from '@/lib/trend'

const WIDTH = 600
const HEIGHT = 200
const PAD_LEFT = 44
const PAD_RIGHT = 16
const PAD_TOP = 14
const PAD_BOTTOM = 26
const PLOT_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM

function monthShortLabel(month: string, isCurrent: boolean): string {
  const label = new Date(`${month}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
  return isCurrent ? `${label}*` : label
}

export function TrendChart({ points }: { points: TrendMonthPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const maxVal = Math.max(...points.map((p) => Math.max(p.income, p.expense)), 1)
  const niceMax = Math.ceil(maxVal / 10000) * 10000 || 1

  function x(i: number): number {
    return points.length <= 1 ? PAD_LEFT : PAD_LEFT + (i / (points.length - 1)) * PLOT_WIDTH
  }
  function y(v: number): number {
    return PAD_TOP + PLOT_HEIGHT - (v / niceMax) * PLOT_HEIGHT
  }
  function path(key: 'income' | 'expense'): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  }
  const areaPath =
    points.length > 0 ? `${path('income')} L ${x(points.length - 1).toFixed(1)} ${y(0)} L ${x(0).toFixed(1)} ${y(0)} Z` : ''

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH
    const i = Math.max(0, Math.min(points.length - 1, Math.round((px - PAD_LEFT) / PLOT_WIDTH * (points.length - 1))))
    setHoverIndex(i)
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full cursor-crosshair"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="trend-income-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6cd3a5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6cd3a5" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((frac) => {
          const gy = PAD_TOP + PLOT_HEIGHT - frac * PLOT_HEIGHT
          return (
            <line
              key={frac}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={gy}
              y2={gy}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={1}
            />
          )
        })}

        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y={HEIGHT - 6} textAnchor="middle" fontSize="9.5" fill="#8891a3">
            {monthShortLabel(p.month, i === points.length - 1)}
          </text>
        ))}

        <path d={areaPath} fill="url(#trend-income-fill)" />
        <path d={path('expense')} fill="none" stroke="#ed8264" strokeWidth={2} />
        <path d={path('income')} fill="none" stroke="#6cd3a5" strokeWidth={2.5} />

        {hovered && (
          <>
            <line
              x1={x(hoverIndex!)}
              x2={x(hoverIndex!)}
              y1={PAD_TOP}
              y2={PAD_TOP + PLOT_HEIGHT}
              stroke="rgba(255,255,255,0.3)"
            />
            <circle cx={x(hoverIndex!)} cy={y(hovered.income)} r={3.5} fill="#6cd3a5" />
            <circle cx={x(hoverIndex!)} cy={y(hovered.expense)} r={3.5} fill="#ed8264" />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="font-ledger-sans pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border border-white/15 bg-[#1a1e26] px-2.5 py-1.5 text-[11px] text-[#ece6d8]"
          style={{ left: `${(x(hoverIndex!) / WIDTH) * 100}%`, top: `${(y(Math.max(hovered.income, hovered.expense)) / HEIGHT) * 100}%` }}
        >
          <p className="font-ledger-mono font-semibold">{monthShortLabel(hovered.month, hoverIndex === points.length - 1)}</p>
          <p>Income {formatCurrency(hovered.income)}</p>
          <p>Expense {formatCurrency(hovered.expense)}</p>
        </div>
      )}
    </div>
  )
}
